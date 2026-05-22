// `DL-` autocomplete provider for the Pi chat editor.
//
// Two triggers, one suggestion list, two insertion behaviors:
//   A. Inside `@decision(DL-`        → inserts `DL-NNN)` (closes paren)
//   B. `@` shortcut                  → inserts `@decision(DL-NNN)` (full annotation)
//
// Bare `DL-` is NOT supported. Pi's editor only auto-invokes autocomplete
// providers in `/`, `@`, or `#` contexts.
// Users type `@DL-185` for mentions — one extra keystroke, always works,
// mirrors the GitHub `#1234` convention.
//
// Pi example mirrored: examples/extensions/github-issue-autocomplete.ts

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	fuzzyFilter,
	type AutocompleteItem,
	type AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import type { Decision, DecisionStatus } from "../core/decision-index.ts";
import type { GetIndex } from "../index.ts";
import { STATUS_GLYPHS } from "../ui/decision-card.ts";

type TriggerKind = "annotation" | "at-shortcut";
type Trigger = { kind: TriggerKind; token: string };

const MAX_SUGGESTIONS = 20;

const STATUS_ORDER: Record<DecisionStatus, number> = {
	proposed: 0,
	accepted: 1,
	superseded: 2,
	deprecated: 3,
};

/**
 * Extract the active trigger from the text immediately before the cursor.
 * Order matters: the more specific `@decision(DL-` pattern wins over the
 * generic `@` pattern (both contain `@`, but the annotation case wants a
 * different insertion behavior).
 */
export function extractTrigger(beforeCursor: string): Trigger | null {
	const annotation = beforeCursor.match(/@decision\(DL-([0-9]*)$/i);
	if (annotation) return { kind: "annotation", token: annotation[1] };

	const atShortcut = beforeCursor.match(/(?:^|[\s,(\[])@([A-Za-z0-9_-]*)$/);
	if (atShortcut) return { kind: "at-shortcut", token: atShortcut[1] };

	return null;
}

/**
 * What text gets replaced when the user accepts a suggestion.
 *  - annotation:  `DL-<token>` (so the `// @decision(` prefix stays put)
 *  - at-shortcut: `@<token>` (so the whole `@feedback` becomes `@decision(DL-185)`)
 */
function buildPrefix(trigger: Trigger): string {
	if (trigger.kind === "annotation") return `DL-${trigger.token}`;
	return `@${trigger.token}`;
}

/**
 * Trigger-dependent insertion text:
 *  - annotation:  `DL-NNN)` (closes the open paren the user already typed)
 *  - at-shortcut: `@decision(DL-NNN)` (full annotation, ready to paste into code)
 */
function makeValue(kind: TriggerKind, id: string): string {
	if (kind === "annotation") return `${id})`;
	return `@decision(${id})`;
}

function formatDecision(d: Decision): { label: string; description: string } {
	const glyph = STATUS_GLYPHS[d.status] ?? "?";
	// Prefer namespace badge in namespaced mode; otherwise show first tag.
	const badge = d.namespace ? `[${d.namespace}]` : d.tags[0] ? `[${d.tags[0]}]` : "";
	const description = badge ? `${d.title}  ${badge}` : d.title;
	return {
		label: `${d.id}  ${glyph} ${d.status}`,
		description,
	};
}

/**
 * Sort: live (proposed/accepted) before stale (superseded/deprecated),
 * then by timestamp descending. Ties broken by status order
 * (proposed → accepted → superseded → deprecated).
 */
export function rankCandidates(candidates: Decision[]): Decision[] {
	return [...candidates].sort((a, b) => {
		const sa = STATUS_ORDER[a.status];
		const sb = STATUS_ORDER[b.status];
		const liveA = sa < 2 ? 0 : 1;
		const liveB = sb < 2 ? 0 : 1;
		if (liveA !== liveB) return liveA - liveB;
		if (a.timestamp !== b.timestamp) return b.timestamp.localeCompare(a.timestamp);
		return sa - sb;
	});
}

export default function autocomplete(
	pi: ExtensionAPI,
	deps: { getIndex: GetIndex },
): void {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) => ({
			async getSuggestions(
				lines,
				cursorLine,
				cursorCol,
				options,
			): Promise<AutocompleteSuggestions | null> {
				const currentLine = lines[cursorLine] ?? "";
				const beforeCursor = currentLine.slice(0, cursorCol);
				const trigger = extractTrigger(beforeCursor);
				if (!trigger) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				const index = await deps.getIndex();
				if (!index || options.signal.aborted) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				let candidates: Decision[];
				if (trigger.token === "") {
					candidates = index.recent(MAX_SUGGESTIONS);
				} else if (/^\d+$/.test(trigger.token)) {
					candidates = index
						.list()
						.filter((d) => String(d.numericId).startsWith(trigger.token));
				} else {
					// Text token — only possible from the @-shortcut trigger.
					candidates = fuzzyFilter(
						index.list(),
						trigger.token,
						(d) =>
							`${d.id} ${d.title} ${d.tags.join(" ")} ${d.namespace ?? ""}`,
					);
				}

				const ranked = rankCandidates(candidates).slice(0, MAX_SUGGESTIONS);
				if (ranked.length === 0) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				return {
					prefix: buildPrefix(trigger),
					items: ranked.map((d): AutocompleteItem => {
						const { label, description } = formatDecision(d);
						return {
							value: makeValue(trigger.kind, d.id),
							label,
							description,
						};
					}),
				};
			},

			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},

			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
			},
		}));
	});
}
