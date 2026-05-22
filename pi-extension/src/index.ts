// Entry point for the dld-kit-pi extension.
//
// Owns the per-session DecisionIndex lifecycle and the guardrail mode
// state. All features share a single parsed/watched index and a single
// source of truth for the guardrail mode (see AGENTS.md "state that
// crosses features lives at the composition seam").
//
// Also owns the footer status indicator so the user can tell at a glance
// whether the extension activated, how many decisions it sees, and what
// guardrail mode is active.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isKeyRelease } from "@earendil-works/pi-tui";
import {
	loadDecisionIndex,
	type DecisionIndex,
	type GuardrailMode,
} from "./core/decision-index.ts";
import { SignalStore } from "./core/signal-store.ts";
import autocomplete from "./features/autocomplete.ts";
import guardrail from "./features/guardrail.ts";
import signalTool, { type GetSignalStore } from "./features/signal-tool.ts";
import { SignalPanel } from "./ui/signal-panel.ts";

/** Resolves to the loaded index, or null if no `dld.config.yaml`. */
export type GetIndex = () => Promise<DecisionIndex | null>;

/** Absolute path to the git root; empty string when not in a git repo. */
export type GetRepoRoot = () => string;

async function resolveGitRoot(pi: ExtensionAPI, cwd: string): Promise<string | null> {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 5000 });
	if (result.code !== 0) return null;
	return result.stdout.trim();
}

/** Widget key. Used by setWidget() and by setWidget(key, undefined) to remove. */
const PANEL_WIDGET_KEY = "dld-panel";

/**
 * Panel height policy: cap body rows (signal content area, not
 * counting borders/help) at ~1/3 of terminal height. Min 8 keeps it
 * usable on small terminals, max 20 prevents it from dominating large
 * ones. Beyond this, the panel scrolls and shows ↑/↓ indicators.
 */
function computeMaxBodyRows(termRows: number): number {
	return Math.max(8, Math.min(20, Math.floor(termRows / 3)));
}

/**
 * Build the prefill text the editor shows after the user picks a signal
 * to respond to. Includes both the human-readable title and the machine
 * id so the agent has both the context and a reference it can echo back
 * when resolving.
 */
function buildPrefill(sig: {
	decisionRef?: string;
	id: string;
	title: string;
}): string {
	const refPrefix = sig.decisionRef ? `${sig.decisionRef} ` : "";
	return `Re: ${refPrefix}(${sig.id}) "${sig.title}":\n\n`;
}

export default function (pi: ExtensionAPI): void {
	let indexPromise: Promise<DecisionIndex | null> = Promise.resolve(null);
	let cachedIndex: DecisionIndex | null = null;
	let signalStore: SignalStore | null = null;
	let unsubSignalStore: (() => void) | null = null;
	let repoRoot = "";
	let mode: GuardrailMode = "surface";

	// Local refresh hook so the footer can be updated from anywhere the
	// composer's state changes (initial load, mode toggle, fs.watch change).
	let refreshFooter: () => void = () => {};

	// Side-channel widget state. Touched by session_start (teardown),
	// agent_start (mount), session_shutdown, and the alt+p toggle handler.
	// Declared up here so all handlers reference real bindings, not
	// closure-deferred ones.
	let panelRef: SignalPanel | null = null;
	let tuiRef: import("@earendil-works/pi-tui").TUI | null = null;
	let panelMounted = false;
	// Sticky 'user explicitly hid via alt+p' flag. Distinct from panelMounted
	// so that subsequent agent_start events don't re-show a panel the user
	// deliberately hid.
	let panelUserHidden = false;
	// Unsubscribe fn for the modal input listener registered when the panel
	// enters interactive (focused) mode. null when not in interactive mode.
	let interactiveUnsub: (() => void) | null = null;

	/**
	 * Mount (or re-mount) the side-channel widget via Pi's setWidget. Used
	 * by agent_start (lazy first-mount) and by alt+p when re-showing a
	 * user-hidden panel. Idempotent: returns immediately if already mounted.
	 *
	 * The factory wires the panel's onRespond/onCancel/onResolve callbacks
	 * here so interactive mode (alt+r) can drive editor prefill, store
	 * mutations, and listener teardown.
	 */
	const mountPanel = (
		ctx: Pick<
			import("@earendil-works/pi-coding-agent").ExtensionContext,
			"ui"
		>,
	): void => {
		if (!signalStore || panelMounted) return;
		const storeRef = signalStore;
		ctx.ui.setWidget(
			PANEL_WIDGET_KEY,
			(tui, theme) => {
				tuiRef = tui;
				const panel = new SignalPanel({
					store: storeRef,
					theme,
					getMaxBodyRows: () => computeMaxBodyRows(tui.terminal.rows),
				});
				panel.onRespond = (sig) => {
					ctx.ui.setEditorText(buildPrefill(sig));
					storeRef.markRead(sig.id);
					exitInteractive();
				};
				panel.onResolve = (sig) => {
					storeRef.markResolved(sig.id);
					// Stay in interactive mode — user may want to act on more.
				};
				panel.onAckAll = () => {
					storeRef.markAllAsRead();
					exitInteractive();
				};
				panel.onCancel = () => {
					exitInteractive();
				};
				panelRef = panel;
				return panel;
			},
			{ placement: "aboveEditor" },
		);
		panelMounted = true;
	};

	/** Tear down the widget without clearing the store (alt+p hide path). */
	const unmountPanel = (
		ctx: Pick<
			import("@earendil-works/pi-coding-agent").ExtensionContext,
			"ui"
		>,
	): void => {
		ctx.ui.setWidget(PANEL_WIDGET_KEY, undefined);
		panelRef = null;
		tuiRef = null;
		panelMounted = false;
	};

	/**
	 * Enter interactive (focused) mode on the panel. Sets the visual
	 * focus flag and registers a modal input listener that consumes all
	 * keys, routing them to panel.handleInput. We don't touch tui.setFocus
	 * — editor stays focused; input listener layer intercepts before
	 * focused-component routing (per Pi's TUI.handleInput dispatch order).
	 */
	const enterInteractive = (): void => {
		if (!panelRef || !tuiRef || interactiveUnsub) return;
		panelRef.setFocused(true);
		const panel = panelRef;
		const tui = tuiRef;
		interactiveUnsub = tui.addInputListener((data) => {
			// Filter out Kitty-protocol key release events. Pi's TUI filters
			// these for focusedComponent dispatch but NOT for input listeners,
			// so under Kitty (Ghostty/Kitty/recent WezTerm) each arrow press
			// would fire panel.handleInput twice (press + release). Still
			// consume so the editor doesn't see the release either.
			if (isKeyRelease(data)) {
				return { consume: true };
			}
			panel.handleInput(data);
			// Pi auto-renders after focusedComponent.handleInput but NOT
			// after input listeners with consume:true. Trigger render
			// manually so selection cursor / state changes paint.
			tui.requestRender();
			return { consume: true };
		});
		tui.requestRender();
	};

	/** Exit interactive mode: deregister listener + clear visual focus. */
	const exitInteractive = (): void => {
		interactiveUnsub?.();
		interactiveUnsub = null;
		panelRef?.setFocused(false);
		tuiRef?.requestRender();
	};

	const getIndex: GetIndex = () => indexPromise;
	const getRepoRoot: GetRepoRoot = () => repoRoot;
	const getSignalStore: GetSignalStore = () => signalStore;
	const getMode = () => mode;
	const setMode = (next: GuardrailMode) => {
		mode = next;
		refreshFooter();
	};

	pi.on("session_start", async (_event, ctx) => {
		// Tear down any previous-session state (relevant on /reload, /new).
		cachedIndex?.close();
		cachedIndex = null;
		unsubSignalStore?.();
		unsubSignalStore = null;
		unmountPanel(ctx);
		panelUserHidden = false;
		signalStore?.clear();
		signalStore = null;
		ctx.ui.setStatus("dld", undefined);
		refreshFooter = () => {};

		const root = await resolveGitRoot(pi, ctx.cwd);
		if (!root) {
			indexPromise = Promise.resolve(null);
			repoRoot = "";
			return;
		}
		repoRoot = root;

		indexPromise = loadDecisionIndex(root);
		const index = await indexPromise;
		cachedIndex = index;
		if (!index) return; // not a DLD project — silent no-op

		// DLD project confirmed: spin up the per-session signal store and
		// register the dld_signal tool so the agent can emit into it.
		signalStore = new SignalStore();
		signalTool(pi, { getSignalStore });

		mode = index.harnessConfig?.guardrail_mode ?? "surface";
		refreshFooter = () => {
			if (!cachedIndex) {
				ctx.ui.setStatus("dld", undefined);
				return;
			}
			const parts = [`DLD: ${cachedIndex.list().length}`, mode];
			if (signalStore) {
				const pending = signalStore.pendingActNowCount();
				const unread = signalStore.unreadCount();
				if (pending > 0) {
					parts.push(`⚠ ${pending} needs response`);
				} else if (unread > 0) {
					parts.push(`${unread} unread`);
				}
			}
			// Hint the user how to reopen the panel when they've explicitly
			// hidden it — otherwise easy to forget the binding exists.
			if (panelUserHidden) {
				parts.push("opt+p show");
			}
			ctx.ui.setStatus("dld", parts.join(" · "));
		};
		refreshFooter();

		// Keep the footer in sync when decisions are added/updated/removed.
		index.onChange(() => refreshFooter());

		// Reactivity: store change → invalidate panel + request paint + footer.
		// Panel ref is captured in the setWidget factory below.
		const storeRef = signalStore;
		unsubSignalStore = storeRef.onChange(() => {
			panelRef?.invalidate();
			tuiRef?.requestRender();
			refreshFooter();
		});
	});

	// --- Side-channel panel: aboveEditor widget ---------------------------
	//
	// Widget renders between chat and input. Pi reflows the chat area to
	// make room — no visual overlap. Content-sized vertically.
	//
	// Visibility lifecycle:
	//   session_start: torn down (clean state)
	//   first agent_start: mounted (lazy)
	//   alt+s: toggles hidden↔shown; hidden state is sticky across turns
	//   session_shutdown: torn down
	pi.on("agent_start", (_event, ctx) => {
		if (panelUserHidden) return; // respect explicit user hide
		mountPanel(ctx);
	});

	// --- Keyboard shortcuts -----------------------------------------------
	//
	// alt+r ("respond"): prefill editor with a reference to the latest
	// actionable signal so the user can type a steer reply quickly. The
	// signal is marked read so the unread count drops; the user submits
	// to actually send the steer to the agent.
	//
	// alt+p ("Panel toggle"): hide if visible, show if hidden. Hidden
	// state is sticky across agent_start (deliberate user hide should not
	// be overridden by the next turn). When hidden, the footer carries an
	// 'opt+p show' hint so the binding stays discoverable.
	//
	// Mac labels: opt+r / opt+p — same physical keys; Pi registers under
	// the canonical 'alt' name. The 'p' is for Panel.
	// (alt+d collided with Pi's built-in tui.editor.deleteWordForward;
	// alt+s was too close to common 'save' bindings.)
	pi.registerShortcut("alt+r", {
		description: "DLD: open signals panel in interactive mode",
		handler: async (ctx) => {
			if (!signalStore) return; // non-DLD project: shortcut is a no-op
			if (signalStore.list().length === 0) {
				ctx.ui.notify("No DLD signals to respond to", "info");
				return;
			}
			// If user had hidden the panel, bring it back so they can see
			// the signal they're navigating to.
			if (panelUserHidden) {
				panelUserHidden = false;
				mountPanel(ctx);
				refreshFooter();
			}
			// Ensure the panel is mounted before entering interactive mode.
			// (agent_start may not have fired yet in a fresh DLD session.)
			if (!panelMounted) mountPanel(ctx);
			enterInteractive();
		},
	});

	pi.registerShortcut("alt+a", {
		description: "DLD: ack all signals (mark all as read)",
		handler: async (ctx) => {
			if (!signalStore) return;
			const n = signalStore.markAllAsRead();
			if (n === 0) {
				ctx.ui.notify("No unread DLD signals", "info");
			} else {
				ctx.ui.notify(`Marked ${n} DLD signal${n === 1 ? "" : "s"} as read`, "info");
			}
		},
	});

	pi.registerShortcut("alt+p", {
		description: "DLD: toggle signals panel",
		handler: async (ctx) => {
			if (!signalStore) return; // non-DLD project: shortcut is a no-op
			if (panelMounted) {
				unmountPanel(ctx);
				panelUserHidden = true;
			} else {
				panelUserHidden = false;
				mountPanel(ctx);
			}
			refreshFooter();
		},
	});

	pi.on("session_shutdown", (_event, ctx) => {
		cachedIndex?.close();
		cachedIndex = null;
		unsubSignalStore?.();
		unsubSignalStore = null;
		unmountPanel(ctx);
		panelUserHidden = false;
		signalStore?.clear();
		signalStore = null;
		indexPromise = Promise.resolve(null);
		repoRoot = "";
		mode = "surface";
		refreshFooter = () => {};
		ctx.ui.setStatus("dld", undefined);
	});

	autocomplete(pi, { getIndex });
	guardrail(pi, { getIndex, getRepoRoot, getMode, setMode });
}
