// SignalPanel — display-only TUI component for the DLD side channel.
//
// Mounted as a right-anchored overlay during agent runs. Pure view:
// no handleInput, no focus grab. The composer owns subscriptions to
// the SignalStore and calls handle.requestRender() on change; this
// component just renders the current state on demand.
//
// Theme-aware: pre-bakes colors into line strings for performance,
// rebuilds on invalidate() per Pi's pattern for components that store
// themed content.
//

import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type {
	Signal,
	SignalKind,
	SignalStore,
	SignalUrgency,
} from "../core/signal-store.ts";

/**
 * Help line variants. Passive = no focus, advertises the keys that
 * activate. Focused = interactive mode, advertises in-mode keys.
 */
const HELP_PASSIVE = "opt+r respond · opt+a ack all · opt+p hide";
// Keep focused-mode help short enough to fit a ~45-col panel inner width
// without truncation. esc-to-cancel is universal enough to skip in the
// legend; users discover it by trying.
const HELP_FOCUSED = "↑↓ navigate · enter respond · x resolve · a ack all";

/** Cursor glyph rendered before the selected signal's title row. */
const SELECTION_CURSOR = "▸ ";

/** Visual glyph per signal kind. Kept terminal-safe (no rare unicode). */
const KIND_GLYPH: Readonly<Record<SignalKind, string>> = {
	progress: "·",
	review: "★",
	"amend-needed": "⚠",
	"review-skipped": "⊘",
	question: "?",
	blocked: "■",
};

/**
 * Short label per kind. Padded to a fixed column inside the panel
 * for vertical alignment.
 */
const KIND_LABEL: Readonly<Record<SignalKind, string>> = {
	progress: "progress",
	review: "review",
	"amend-needed": "amend",
	"review-skipped": "skipped",
	question: "question",
	blocked: "blocked",
};

const KIND_LABEL_WIDTH = 8;

/**
 * Theme color used per urgency. We resolve through `theme.fg(name, s)`
 * at render time so theme changes propagate via invalidate().
 */
function urgencyColor(u: SignalUrgency): "muted" | "warning" | "error" {
	if (u === "act-now") return "error";
	if (u === "review") return "warning";
	return "muted";
}

/** Minimum width below which we render a compact fallback layout. */
const COMPACT_WIDTH_THRESHOLD = 36;

/**
 * Box drawing: every rendered line is wrapped with a vertical bar and
 * a space on each side, so total chrome overhead is 4 cols (│ + space
 * + content + space + │). Top/bottom borders use rounded corners.
 */
const BORDER_OVERHEAD = 4;

export class SignalPanel implements Component {
	#store: SignalStore;
	#theme: Theme;
	#helpText: string;

	#cachedWidth: number | undefined;
	#cachedLines: string[] | undefined;
	#cachedMinHeight: number | undefined;
	#cachedFocused: boolean | undefined;
	#cachedSelectedIndex: number | undefined;

	#getMinHeight: () => number;
	#getMaxBodyRows: () => number;

	/**
	 * Scroll position — index of the topmost visible signal in the
	 * current viewport. -1 means 'auto-stick to bottom' (default,
	 * computed each render from the visible window).
	 *
	 * Set explicitly during focused-mode navigation when the user wants
	 * to look at older signals; reset to -1 on focus-loss so passive
	 * viewing always tracks the latest.
	 */
	#viewportTop = -1;

	/**
	 * Visual focus state — controlled externally via setFocused(). True
	 * means interactive mode: border highlights, selection cursor shows,
	 * help text switches to the navigation legend.
	 *
	 * We do NOT implement the Focusable interface and we do NOT register
	 * with tui.setFocus(). Editor stays focused throughout; the composer
	 * uses tui.addInputListener() to capture keys in interactive mode.
	 * That way exiting interactive mode requires no focus restoration.
	 */
	#focused = false;
	#selectedIndex = -1;

	/**
	 * Callbacks invoked from handleInput. The composer wires these up
	 * to drive editor prefill, store mutations, and listener teardown.
	 */
	onRespond?: (signal: Signal) => void;
	onResolve?: (signal: Signal) => void;
	onAckAll?: () => void;
	onCancel?: () => void;

	constructor(opts: {
		store: SignalStore;
		theme: Theme;
		/**
		 * Help text rendered at the bottom of the panel when NOT focused.
		 * Defaults to the built-in HELP_PASSIVE. When focused, the panel
		 * switches to HELP_FOCUSED automatically.
		 */
		helpText?: string;
		/**
		 * Optional callback returning the minimum total line count the
		 * panel should render. If the actual content is shorter, the
		 * body is padded with blank rows so the box visually fills the
		 * sidebar instead of shrinking to content. Returns 0 to disable.
		 */
		getMinHeight?: () => number;
		/**
		 * Optional callback returning the max number of lines the body
		 * (signal content + scroll indicators, excluding help section and
		 * borders) may use. When natural content exceeds this, the panel
		 * scrolls: only a window of signals renders, with '↑ N older above'
		 * and '↓ N more below' indicators in the off-screen positions.
		 * Return Infinity to disable scrolling (render everything).
		 */
		getMaxBodyRows?: () => number;
	}) {
		this.#store = opts.store;
		this.#theme = opts.theme;
		this.#helpText = opts.helpText ?? HELP_PASSIVE;
		this.#getMinHeight = opts.getMinHeight ?? (() => 0);
		this.#getMaxBodyRows = opts.getMaxBodyRows ?? (() => Infinity);
	}

	/** Allow the composer to swap (passive) help text without recreating the panel. */
	setHelpText(text: string): void {
		this.#helpText = text;
		this.invalidate();
	}

	/** Read-only access to focus state for tests and callers. */
	get focused(): boolean {
		return this.#focused;
	}

	/** Read-only access to current selection (for tests). */
	get selectedIndex(): number {
		return this.#selectedIndex;
	}

	/**
	 * Set interactive-mode focus. On focus-gain, selection seeds to
	 * latestActionable() (or last signal, or -1 if empty). On focus-loss,
	 * selection state is preserved — re-focusing re-seeds.
	 */
	setFocused(value: boolean): void {
		if (this.#focused === value) return;
		this.#focused = value;
		if (value) {
			this.#seedSelection();
			// Stay where auto-bottom is until user navigates. -1 keeps the
			// auto-stick-to-latest behavior computed per render.
		} else {
			// On focus loss, snap back to auto-stick so the next passive
			// render shows the latest signal.
			this.#viewportTop = -1;
		}
		this.invalidate();
	}

	#seedSelection(): void {
		const signals = this.#store.list();
		if (signals.length === 0) {
			this.#selectedIndex = -1;
			return;
		}
		const latest = this.#store.latestActionable();
		if (latest) {
			const i = signals.findIndex((s) => s.id === latest.id);
			this.#selectedIndex = i >= 0 ? i : signals.length - 1;
		} else {
			// All progress/resolved — land on the last (newest) entry
			this.#selectedIndex = signals.length - 1;
		}
	}

	/**
	 * Handle keyboard input. Only called when interactive mode is active
	 * (composer's input listener routes input here). Dispatches navigation,
	 * action, and cancel keys; mutates selection state; fires callbacks.
	 */
	handleInput(data: string): void {
		const signals = this.#store.list();

		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.onCancel?.();
			return;
		}

		if (signals.length === 0) return;

		if (matchesKey(data, Key.up) || data === "k") {
			if (this.#selectedIndex > 0) {
				this.#selectedIndex -= 1;
				this.#scrollSelectionIntoView();
				this.invalidate();
			}
			return;
		}

		if (matchesKey(data, Key.down) || data === "j") {
			if (this.#selectedIndex < signals.length - 1) {
				this.#selectedIndex += 1;
				this.#scrollSelectionIntoView();
				this.invalidate();
			}
			return;
		}

		// 'a' = ack all (mark all read). Defers to composer for the store
		// mutation so audit logging / footer refresh stays centralized.
		if (data === "a") {
			this.onAckAll?.();
			return;
		}

		if (this.#selectedIndex < 0) return;
		const current = signals[this.#selectedIndex];
		if (!current) return;

		// Action keys only fire on actionable signals. `progress` is a
		// passive milestone — there's nothing to respond to or resolve.
		// Navigation still lands on them (user may want to read detail).
		if (!isActionable(current)) return;

		if (matchesKey(data, Key.enter) || data === "r") {
			this.onRespond?.(current);
			return;
		}

		if (data === "x") {
			this.onResolve?.(current);
			return;
		}

		// Other keys are silently consumed by the composer's modal listener —
		// no fall-through to the editor while interactive mode is active.
	}

	#cachedMaxBodyRows: number | undefined;
	#cachedViewportTop: number | undefined;
	#cachedSignalSig: string | undefined;

	render(width: number): string[] {
		const minHeight = this.#getMinHeight();
		const maxBodyRows = this.#getMaxBodyRows();
		// Content signature so external store changes (new signal, read flip)
		// bypass the cache without us subscribing to onChange directly.
		const signalSig = this.#signalsSignature();
		if (
			this.#cachedWidth === width &&
			this.#cachedMinHeight === minHeight &&
			this.#cachedMaxBodyRows === maxBodyRows &&
			this.#cachedFocused === this.#focused &&
			this.#cachedSelectedIndex === this.#selectedIndex &&
			this.#cachedViewportTop === this.#viewportTop &&
			this.#cachedSignalSig === signalSig &&
			this.#cachedLines
		) {
			return this.#cachedLines;
		}
		this.#cachedLines = this.#buildFramed(width, minHeight, maxBodyRows);
		this.#cachedWidth = width;
		this.#cachedMinHeight = minHeight;
		this.#cachedMaxBodyRows = maxBodyRows;
		this.#cachedFocused = this.#focused;
		this.#cachedSelectedIndex = this.#selectedIndex;
		this.#cachedViewportTop = this.#viewportTop;
		this.#cachedSignalSig = signalSig;
		return this.#cachedLines;
	}

	invalidate(): void {
		this.#cachedWidth = undefined;
		this.#cachedMinHeight = undefined;
		this.#cachedMaxBodyRows = undefined;
		this.#cachedFocused = undefined;
		this.#cachedSelectedIndex = undefined;
		this.#cachedViewportTop = undefined;
		this.#cachedSignalSig = undefined;
		this.#cachedLines = undefined;
	}

	// --- private rendering ------------------------------------------------

	/** Cheap content signature for cache key. id|read|resolved per signal. */
	#signalsSignature(): string {
		const parts: string[] = [];
		for (const s of this.#store.list()) {
			parts.push(`${s.id}|${s.read ? 1 : 0}|${s.resolved ? 1 : 0}`);
		}
		return parts.join(",");
	}

	/**
	 * Adjust #viewportTop so the currently-selected signal is visible
	 * within maxBodyRows. Called from navigation handlers.
	 */
	#scrollSelectionIntoView(): void {
		const maxBodyRows = this.#getMaxBodyRows();
		if (!Number.isFinite(maxBodyRows) || maxBodyRows <= 0) return;
		const signals = this.#store.list();
		if (this.#selectedIndex < 0 || this.#selectedIndex >= signals.length) return;

		const current = this.#effectiveViewportTop(maxBodyRows);

		if (this.#selectedIndex < current) {
			// Above viewport — snap top to selection.
			this.#viewportTop = this.#selectedIndex;
			return;
		}

		const visibleFromCurrent = this.#countVisibleFromTop(
			current,
			maxBodyRows,
		);
		if (this.#selectedIndex >= current + visibleFromCurrent) {
			// Below viewport — scroll up just enough that selection
			// becomes the last visible signal.
			let top = this.#selectedIndex;
			while (top > 0) {
				const rows = this.#rowsForRange(top - 1, this.#selectedIndex);
				if (rows > maxBodyRows) break;
				top -= 1;
			}
			this.#viewportTop = top;
		}
	}

	/**
	 * Resolve effective viewport top. -1 means auto-stick: compute from
	 * the bottom up so the latest signal fits as the last visible row.
	 *
	 * Must use the same effective budget as #buildFramed (maxBodyRows - 2,
	 * reserving 2 rows for the worst-case '↑ above' / '↓ below' indicators).
	 * Mismatch produces a top index where #buildFramed truncates the
	 * latest signal off the bottom — the opposite of auto-stick's intent.
	 */
	#effectiveViewportTop(maxBodyRows: number): number {
		const signals = this.#store.list();
		if (signals.length === 0) return 0;
		if (this.#viewportTop >= 0 && this.#viewportTop < signals.length) {
			return this.#viewportTop;
		}
		if (!Number.isFinite(maxBodyRows) || maxBodyRows <= 0) return 0;
		const effectiveBudget = Math.max(1, maxBodyRows - 2);
		const lastIdx = signals.length - 1;
		let top = lastIdx;
		while (top > 0) {
			const rows = this.#rowsForRange(top - 1, lastIdx);
			if (rows > effectiveBudget) break;
			top -= 1;
		}
		return top;
	}

	/** Count signals starting at `from` that fit in `budgetRows`. >= 1. */
	#countVisibleFromTop(from: number, budgetRows: number): number {
		const signals = this.#store.list();
		let used = 0;
		let count = 0;
		for (let i = from; i < signals.length; i += 1) {
			const rows = this.#estimateSignalRows(signals[i]!, i);
			if (used + rows > budgetRows && count > 0) break;
			used += rows;
			count += 1;
		}
		return Math.max(count, 1);
	}

	/** Total rows for signals[from..=to] inclusive. */
	#rowsForRange(from: number, to: number): number {
		const signals = this.#store.list();
		let n = 0;
		for (let i = from; i <= to; i += 1) {
			n += this.#estimateSignalRows(signals[i]!, i);
		}
		return n;
	}

	/**
	 * Estimate render rows for a signal without full wrap math.
	 * Read-and-not-selected = 1 (title-only collapse). Otherwise:
	 * title + rough detail-line count + suggested-action row.
	 */
	#estimateSignalRows(s: Signal, idx: number): number {
		const selected = this.#focused && idx === this.#selectedIndex;
		if (s.read && !selected) return 1;
		let rows = 1;
		if (s.detail) rows += Math.max(1, s.detail.split("\n").length);
		if (s.suggestedAction && !s.resolved) rows += 1;
		return rows;
	}

	/**
	 * Build the full framed panel: top border, content body lines,
	 * (padding to fill min height), help separator+line, bottom border.
	 * If minHeight is set and the natural content is shorter, blank
	 * rows are inserted between the content and the help section so the
	 * help text stays anchored to the bottom of the box.
	 */
	#buildFramed(
		width: number,
		minHeight: number,
		maxBodyRows: number,
	): string[] {
		const inner = Math.max(0, width - BORDER_OVERHEAD);
		const compact = inner < COMPACT_WIDTH_THRESHOLD;
		const signals = this.#store.list();
		const unread = this.#store.unreadCount();

		// Content body (signal rows or empty-state hint). When natural
		// content exceeds maxBodyRows, a viewport window is shown with
		// '↑ N older above' / '↓ N more below' indicators outside it.
		const contentLines: string[] = [];
		if (signals.length === 0) {
			contentLines.push("");
			contentLines.push(this.#theme.fg("muted", "(no signals yet)"));
		} else {
			const top = this.#effectiveViewportTop(maxBodyRows);
			const budgeted = Number.isFinite(maxBodyRows) && maxBodyRows > 0;
			// Reserve up to 2 rows for above/below indicators so they don't
			// crowd out a visible signal.
			const signalsBudget = budgeted
				? Math.max(1, maxBodyRows - 2)
				: Infinity;
			const rendered: number[] = [];
			let used = 0;
			for (let i = top; i < signals.length; i += 1) {
				const rows = this.#estimateSignalRows(signals[i]!, i);
				if (used + rows > signalsBudget && rendered.length > 0) break;
				used += rows;
				rendered.push(i);
			}

			const hasAbove = top > 0;
			const hasBelow =
				rendered.length > 0
					? rendered[rendered.length - 1]! < signals.length - 1
					: false;

			if (hasAbove) {
				contentLines.push(
					this.#theme.fg("dim", `   ↑ ${top} older above`),
				);
			}
			for (const i of rendered) {
				const s = signals[i]!;
				const isSelected = this.#focused && i === this.#selectedIndex;
				for (const l of this.#signalLines(s, inner, compact, isSelected)) {
					contentLines.push(l);
				}
			}
			if (hasBelow) {
				const more =
					signals.length - 1 - rendered[rendered.length - 1]!;
				contentLines.push(
					this.#theme.fg("dim", `   ↓ ${more} more below`),
				);
			}
		}

		// Help section (always renders; help text anchored to bottom).
		// In interactive mode, swap to the navigation legend.
		const helpText = this.#focused ? HELP_FOCUSED : this.#helpText;
		const helpSection = [
			"",
			this.#theme.fg(this.#focused ? "accent" : "dim", helpText),
		];

		// Fill section: blank lines to reach minHeight. Chrome cost is
		// 2 lines (top + bottom border). Body = content + fill + help.
		const chromeCost = 2;
		const neededBodyRows = Math.max(0, minHeight - chromeCost);
		const naturalBodyRows = contentLines.length + helpSection.length;
		const fillRows = Math.max(0, neededBodyRows - naturalBodyRows);
		const fillSection = Array.from({ length: fillRows }, () => "");

		const body = [...contentLines, ...fillSection, ...helpSection];

		const lines: string[] = [];
		lines.push(this.#topBorder(width, signals.length, unread));
		for (const line of body) {
			lines.push(this.#wrapBodyLine(line, inner));
		}
		lines.push(this.#bottomBorder(width));
		return lines;
	}

	/**
	 * Wrap a single body line in the side borders: "│ <line padded> │".
	 * Truncates if necessary; otherwise pads with spaces so the right
	 * border aligns.
	 */
	#wrapBodyLine(content: string, innerWidth: number): string {
		const t = this.#theme;
		const visible = visibleWidth(content);
		const safe =
			visible <= innerWidth ? content : truncateToWidth(content, innerWidth);
		const pad = Math.max(0, innerWidth - visibleWidth(safe));
		const border = t.fg(this.#focused ? "accent" : "border", "│");
		return `${border} ${safe}${" ".repeat(pad)} ${border}`;
	}

	/**
	 * Top border with the title embedded: "╭─ title ───╮".
	 * Border + title color shift to accent when focused, so the entire
	 * frame visibly lights up in interactive mode.
	 */
	#topBorder(width: number, total: number, unread: number): string {
		const t = this.#theme;
		const borderColor = this.#focused ? "accent" : "border";
		// Budget for title content between "╭─ " (3) and " ╮" trailing.
		// Trailing always has at least " ╮" (3 chars: ─ + ╮ ... wait it's ─╮
		// plus padding). Simplest: budget = width - 3 (╭─ ) - 1 (╮) - 1 (space).
		const maxTitle = Math.max(0, width - 5);
		const long =
			unread > 0
				? `DLD signals · ${total} total · ${unread} unread`
				: `DLD signals · ${total} total`;
		const compactTitle =
			unread > 0 ? `DLD ${total}/${unread}` : `DLD ${total}`;
		const title =
			visibleWidth(long) <= maxTitle
				? long
				: visibleWidth(compactTitle) <= maxTitle
					? compactTitle
					: truncateToWidth(compactTitle, maxTitle);
		const usedAroundTitle = 5 + visibleWidth(title); // ╭─ + title + space + ╮
		const trailing = Math.max(0, width - usedAroundTitle);
		return (
			t.fg(borderColor, "╭─ ") +
			t.fg("accent", t.bold(title)) +
			t.fg(borderColor, ` ${"─".repeat(trailing)}╮`)
		);
	}

	#bottomBorder(width: number): string {
		const inner = Math.max(0, width - 2); // for ╰ ... ╯
		const borderColor = this.#focused ? "accent" : "border";
		return this.#theme.fg(borderColor, `╰${"─".repeat(inner)}╯`);
	}



	/**
	 * One signal renders as 1 (title only) or N (title + wrapped detail) lines.
	 * Detail is indented under the title and shown in muted color.
	 *
	 * When `selected` is true (only possible in focused interactive mode),
	 * the title row is prefixed with the selection cursor and rendered in
	 * accent color so the user can clearly see which signal will receive
	 * an enter/r/x action.
	 */
	#signalLines(
		s: Signal,
		width: number,
		compact: boolean,
		selected: boolean,
	): string[] {
		const collapsed = s.read && !selected;
		const t = this.#theme;
		const color = urgencyColor(s.urgency);
		const resolved = s.resolved;

		const glyph = KIND_GLYPH[s.kind];
		const label = KIND_LABEL[s.kind].padEnd(KIND_LABEL_WIDTH, " ");
		const time = formatTime(s.ts);

		// Decoration: ★ for unread (drops attention), ✓ for resolved
		const status = resolved ? t.fg("success", "✓") : s.read ? " " : t.fg("accent", "★");

		// Title row layout:
		//   compact   : "  G  TITLE…              T"
		//   wide      : "  G  label    · TITLE…   T"
		// Skip the decisionRef: prefix when the agent already led with it,
		// to avoid the common 'DL-218: DL-218 stuff' double-stamp.
		const titleRaw =
			s.decisionRef && !s.title.startsWith(s.decisionRef)
				? `${s.decisionRef}: ${s.title}`
				: s.title;

		// Note the trailing space after the label before · — keeps the
		// separator visually detached even when the label is at full width.
		const basePrefix = compact
			? `${status} ${t.fg(color, glyph)} `
			: `${status} ${t.fg(color, glyph)}  ${t.fg(color, label)} · `;
		const cursor = selected
			? t.fg("accent", t.bold(SELECTION_CURSOR))
			: " ".repeat(visibleWidth(SELECTION_CURSOR));
		const prefix = `${cursor}${basePrefix}`;
		const prefixWidth = visibleWidth(prefix);
		const timeSuffix = ` ${t.fg("dim", time)}`;
		const timeWidth = visibleWidth(timeSuffix);
		const titleBudget = Math.max(8, width - prefixWidth - timeWidth);

		const titleTrunc = truncateToWidth(titleRaw, titleBudget);
		const titleStyled = resolved
			? t.fg("dim", titleTrunc)
			: selected
				? t.fg("accent", t.bold(titleTrunc))
				: titleTrunc;

		// Pad title to titleBudget so the time aligns right
		const padCount = Math.max(0, titleBudget - visibleWidth(titleStyled));
		const titleLine = `${prefix}${titleStyled}${" ".repeat(padCount)}${timeSuffix}`;

		const lines = [titleLine];

		// Collapse: read-and-not-selected signals show title only.
		// Selecting a read signal in focused mode re-expands it.
		if (collapsed) return lines;

		if (s.detail) {
			// Indent detail under the glyph; wrap to remaining width.
			// wrapTextWithAnsi returns string[]; one entry per wrapped line.
			const indent = "     ";
			const detailWidth = Math.max(8, width - indent.length);
			const wrapped = wrapTextWithAnsi(s.detail, detailWidth);
			for (const w of wrapped) {
				lines.push(`${indent}${t.fg("muted", w)}`);
			}
		}

		if (s.suggestedAction && !resolved) {
			const indent = "     ";
			const w = Math.max(8, width - indent.length - 2);
			lines.push(
				`${indent}${t.fg("dim", `→ ${truncateToWidth(s.suggestedAction, w)}`)}`,
			);
		}

		return lines;
	}
}

/**
 * Whether a signal is actionable in interactive mode. Progress
 * signals are passive milestones — no respond, no resolve. All other
 * kinds are user-actionable.
 */
function isActionable(s: Signal): boolean {
	return s.kind !== "progress";
}

/**
 * 24h HH:MM. We deliberately don't show seconds — the panel is a
 * skim surface, second-level precision is noise.
 */
function formatTime(iso: string): string {
	const d = new Date(iso);
	const h = d.getHours().toString().padStart(2, "0");
	const m = d.getMinutes().toString().padStart(2, "0");
	return `${h}:${m}`;
}
