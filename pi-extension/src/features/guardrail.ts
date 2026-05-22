// Pre-edit guardrail: auto-inject decisions for files the agent touches.
//
//   tool_result on `read`        → fuses decisions into the LLM-visible
//                                  result content. The agent literally
//                                  cannot read the file without the
//                                  decisions arriving alongside.
//   tool_call on `edit` / `write`
//     mode=surface (default)     → steer a card so the agent sees the
//                                  decisions on its next turn.
//     mode=strict                → block in tool_call if the relevant
//                                  decisions aren't already in recent
//                                  context; include their text in the
//                                  block reason.
//   /dld-strict                  → runtime toggle of the mode.
//
// User-facing TUI: a `dld-guardrail` custom message rendered as a
// collapsible card in the transcript via registerMessageRenderer.
//
// Persistent log: each fuse/steer/block writes a `dld-guardrail-event`
// custom entry. Powers plan 03 (ambient widget counts) and plan 05
// (audit-outcomes panel).
//

import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType, keyHint } from "@earendil-works/pi-coding-agent";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import { Box, Text, type Component } from "@earendil-works/pi-tui";
import { computeRelevantDecisions } from "../core/annotations.ts";
import type { Decision, GuardrailMode } from "../core/decision-index.ts";
import { renderInjectionBlock, type DecisionForInjection } from "../core/render-llm.ts";
import type { GetIndex, GetRepoRoot } from "../index.ts";
import { STATUS_GLYPHS } from "../ui/decision-card.ts";

type ToolContent = (TextContent | ImageContent)[];

export type GuardrailDeps = {
	getIndex: GetIndex;
	getRepoRoot: GetRepoRoot;
	getMode: () => GuardrailMode;
	setMode: (m: GuardrailMode) => void;
};

const VALID_MODES: readonly GuardrailMode[] = ["off", "surface", "strict"] as const;
const STRICT_LOOKBACK_DEFAULT = 100; // entries (not turns)

// Subset of Decision serialized into the message details so the renderer
// can show titles/tags/etc without re-reading the file.
type DecisionCardData = Pick<
	Decision,
	"id" | "status" | "title" | "tags" | "supersedes" | "amends" | "timestamp"
>;

type GuardrailMessageDetails = {
	file: string;
	decisions: DecisionCardData[];
	unknownIds: string[];
	mode: GuardrailMode;
	action: "fuse" | "steer" | "block";
};

export default function guardrail(pi: ExtensionAPI, deps: GuardrailDeps): void {
	// Per-turn dedup: same decision injected at most once per turn even if
	// the agent reads the file multiple times. Reset on turn_start.
	// Deliberately NOT cross-turn — compaction may summarize fused content
	// away and we'd rather waste tokens than lose the guardrail.
	let seenThisTurn = new Set<string>();

	pi.on("turn_start", () => {
		seenThisTurn = new Set();
	});

	// ── tool_result on `read`: fuse decisions into the content array ──
	pi.on("tool_result", async (event, _ctx) => {
		if (event.toolName !== "read" || event.isError) return;

		const mode = deps.getMode();
		if (mode === "off") return;
		const index = await deps.getIndex();
		if (!index) return;
		const repoRoot = deps.getRepoRoot();
		if (!repoRoot) return;

		const filePath = (event.input as { path?: string }).path;
		if (!filePath) return;
		const relPath = relative(repoRoot, filePath);
		const fileText = extractText(event.content);
		if (fileText === null) return; // binary / image read — skip

		const relevant = computeRelevantDecisions(
			index,
			relPath,
			fileText,
			index.annotationPrefix,
		);
		const all = [...relevant.fromAnnotations, ...relevant.fromReferences];
		const fresh = all.filter((d) => !seenThisTurn.has(d.id));
		if (fresh.length === 0 && relevant.unknownIds.length === 0) return;

		fresh.forEach((d) => seenThisTurn.add(d.id));
		relevant.successors.forEach((s) => seenThisTurn.add(s.id));

		const injection = renderInjectionBlock(
			relPath,
			fresh.map((d) => withSuccessor(d, relevant.successors)),
			relevant.unknownIds,
		);
		const newContent = appendText(event.content, injection);

		emitCard(pi, "fuse", relPath, fresh, relevant.unknownIds, mode);
		logEvent(pi, {
			toolCallId: event.toolCallId,
			tool: "read",
			file: relPath,
			action: "fuse",
			decisions: fresh.map((d) => ({ id: d.id, status: d.status })),
			unknownIds: relevant.unknownIds,
			mode,
		});

		return { content: newContent };
	});

	// ── tool_call on `edit` / `write`: steer (surface) or block (strict) ──
	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("edit", event) && !isToolCallEventType("write", event)) return;

		const mode = deps.getMode();
		if (mode === "off") return;
		const index = await deps.getIndex();
		if (!index) return;
		const repoRoot = deps.getRepoRoot();
		if (!repoRoot) return;

		const filePath = event.input.path;
		if (!filePath) return;
		const relPath = relative(repoRoot, filePath);
		const fileContent = await safeReadFile(filePath); // null for new files
		const relevant = computeRelevantDecisions(
			index,
			relPath,
			fileContent,
			index.annotationPrefix,
		);
		const all = [...relevant.fromAnnotations, ...relevant.fromReferences];
		if (all.length === 0 && relevant.unknownIds.length === 0) return;

		if (mode === "strict") {
			const branch = ctx.sessionManager.getBranch();
			const seenInContext = inRecentContext(branch, all, STRICT_LOOKBACK_DEFAULT);
			const unseen = all.filter((d) => !seenInContext.has(d.id));
			if (unseen.length > 0) {
				const reasonText = renderInjectionBlock(
					relPath,
					unseen.map((d) => withSuccessor(d, relevant.successors)),
					relevant.unknownIds,
				);
				emitCard(pi, "block", relPath, unseen, relevant.unknownIds, mode);
				logEvent(pi, {
					toolCallId: event.toolCallId,
					tool: event.toolName,
					file: relPath,
					action: "block",
					decisions: unseen.map((d) => ({ id: d.id, status: d.status })),
					unknownIds: relevant.unknownIds,
					mode,
				});
				return {
					block: true,
					reason: `Read these decisions before modifying ${relPath}.\n${reasonText}`,
				};
			}
			// All seen in context — fall through, no surface needed in strict.
			return;
		}

		// Surface mode: steer a card so the LLM sees decisions on next turn.
		const fresh = all.filter((d) => !seenThisTurn.has(d.id));
		if (fresh.length === 0 && relevant.unknownIds.length === 0) return;

		fresh.forEach((d) => seenThisTurn.add(d.id));
		relevant.successors.forEach((s) => seenThisTurn.add(s.id));

		const steerText = renderInjectionBlock(
			relPath,
			fresh.map((d) => withSuccessor(d, relevant.successors)),
			relevant.unknownIds,
		);

		pi.sendMessage(
			{
				customType: "dld-guardrail",
				content: steerText,
				display: true,
				details: cardDetails(relPath, fresh, relevant.unknownIds, mode, "steer"),
			},
			{ deliverAs: "steer" },
		);
		logEvent(pi, {
			toolCallId: event.toolCallId,
			tool: event.toolName,
			file: relPath,
			action: "steer",
			decisions: fresh.map((d) => ({ id: d.id, status: d.status })),
			unknownIds: relevant.unknownIds,
			mode,
		});
	});

	// ── /dld-strict — runtime mode toggle ──
	pi.registerCommand("dld-strict", {
		description: "Set DLD guardrail mode (off | surface | strict)",
		getArgumentCompletions: (prefix) => {
			const p = prefix.toLowerCase();
			const items = VALID_MODES.filter((m) => m.startsWith(p)).map((m) => ({
				value: m,
				label: m,
			}));
			return items.length ? items : null;
		},
		handler: async (args, ctx) => {
			const arg = args.trim().toLowerCase();
			const next = (arg || "strict") as GuardrailMode;
			if (!VALID_MODES.includes(next)) {
				ctx.ui.notify(`Invalid mode: ${arg}. Use off | surface | strict.`, "error");
				return;
			}
			deps.setMode(next);
			ctx.ui.notify(`DLD guardrail: ${next}`, "info");
		},
	});

	// ── Custom message renderer for `dld-guardrail` ──
	pi.registerMessageRenderer<GuardrailMessageDetails>(
		"dld-guardrail",
		(message, { expanded }, theme) => renderGuardrailCard(message, expanded, theme),
	);
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function withSuccessor(
	d: Decision,
	successors: Decision[],
): DecisionForInjection {
	const succ = successors.find((s) => s.supersedes.includes(d.id));
	return { decision: d, supersededBy: succ?.id };
}

function emitCard(
	pi: ExtensionAPI,
	action: "fuse" | "steer" | "block",
	file: string,
	decisions: Decision[],
	unknownIds: string[],
	mode: GuardrailMode,
): void {
	// Steer mode is sent above with deliverAs: 'steer' because the message
	// content also goes to the LLM. fuse/block use display-only messaging
	// (the LLM already got the content via tool_result content / block reason).
	pi.sendMessage({
		customType: "dld-guardrail",
		content: `${decisions.length} decision${decisions.length === 1 ? "" : "s"} loaded for ${file}`,
		display: true,
		details: cardDetails(file, decisions, unknownIds, mode, action),
	});
}

function cardDetails(
	file: string,
	decisions: Decision[],
	unknownIds: string[],
	mode: GuardrailMode,
	action: "fuse" | "steer" | "block",
): GuardrailMessageDetails {
	return {
		file,
		decisions: decisions.map((d) => ({
			id: d.id,
			status: d.status,
			title: d.title,
			tags: d.tags,
			supersedes: d.supersedes,
			amends: d.amends,
			timestamp: d.timestamp,
		})),
		unknownIds,
		mode,
		action,
	};
}

type GuardrailLogEvent = {
	toolCallId: string;
	tool: "read" | "edit" | "write";
	file: string;
	action: "fuse" | "steer" | "block";
	decisions: { id: string; status: Decision["status"] }[];
	unknownIds: string[];
	mode: GuardrailMode;
};

function logEvent(pi: ExtensionAPI, event: GuardrailLogEvent): void {
	pi.appendEntry<GuardrailLogEvent>("dld-guardrail-event", event);
}

// ── tool_result content helpers ──

function extractText(content: ToolContent): string | null {
	let out = "";
	let found = false;
	for (const part of content) {
		if (part.type === "text" && typeof part.text === "string") {
			out += part.text;
			found = true;
		}
	}
	return found ? out : null;
}

function appendText(content: ToolContent, suffix: string): ToolContent {
	const next: ToolContent = [...content];
	for (let i = next.length - 1; i >= 0; i--) {
		const part = next[i];
		if (part.type === "text" && typeof part.text === "string") {
			next[i] = { ...part, text: part.text + suffix };
			return next;
		}
	}
	next.push({ type: "text", text: suffix });
	return next;
}

async function safeReadFile(filePath: string): Promise<string | null> {
	try {
		return await readFile(filePath, "utf8");
	} catch {
		return null;
	}
}

// ── Strict-mode "is this decision in the agent's recent context?" check ──
//
// v1 simplification: walk the last N entries of the active branch, look for
// the decision ID as a substring in any text content. Cheap and good enough
// in practice. A precise version would maintain a per-decision last-seen
// cache keyed on entry IDs.

type BranchEntry = { type: string; message?: unknown; data?: unknown; content?: unknown };

function inRecentContext(
	entries: readonly BranchEntry[],
	decisions: Decision[],
	lookback: number,
): Set<string> {
	const seen = new Set<string>();
	const start = Math.max(0, entries.length - lookback);
	for (let i = entries.length - 1; i >= start; i--) {
		const text = stringifyEntry(entries[i]);
		if (!text) continue;
		for (const d of decisions) {
			if (seen.has(d.id)) continue;
			if (text.includes(d.id)) seen.add(d.id);
		}
		if (seen.size === decisions.length) break;
	}
	return seen;
}

function stringifyEntry(entry: BranchEntry): string {
	if (!entry) return "";
	if (entry.type === "message") {
		const msg = (entry as { message?: { content?: unknown } }).message;
		if (!msg) return "";
		if (typeof msg.content === "string") return msg.content;
		if (Array.isArray(msg.content)) {
			return msg.content
				.map((c) => (c && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : ""))
				.join(" ");
		}
		return "";
	}
	// Custom entries (including guardrail logs and any extension-injected
	// messages with text content). Fall back to JSON stringify — cheap and
	// catches stringy fields without needing per-shape parsing.
	try {
		return JSON.stringify(entry);
	} catch {
		return "";
	}
}

// ──────────────────────────────────────────────────────────────────────
// TUI renderer for the `dld-guardrail` custom message
// ──────────────────────────────────────────────────────────────────────

function renderGuardrailCard(
	message: {
		customType: string;
		content: string | (TextContent | ImageContent)[];
		details?: GuardrailMessageDetails;
	},
	expanded: boolean,
	theme: Theme,
): Component {
	const details = message.details;
	const fallback = typeof message.content === "string" ? message.content : "";
	const text = details
		? expanded
			? `${formatHeader(details, theme, true)}\n${formatExpanded(details, theme)}`
			: formatHeader(details, theme, false)
		: theme.fg("dim", fallback);

	const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
	box.addChild(new Text(text, 0, 0));
	return box;
}

function formatHeader(d: GuardrailMessageDetails, theme: Theme, expanded: boolean): string {
	const tag = theme.fg(
		d.action === "block" ? "error" : d.action === "fuse" ? "success" : "accent",
		`[DLD ${d.action}]`,
	);
	const pips = d.decisions
		.map((dec) => `${dec.id} ${STATUS_GLYPHS[dec.status] ?? "?"}`)
		.join(", ");
	const counts: string[] = [];
	const n = d.decisions.length;
	if (n) counts.push(`${n} decision${n === 1 ? "" : "s"}`);
	if (d.unknownIds.length) counts.push(theme.fg("warning", `${d.unknownIds.length} unknown`));
	// Reuse Pi's tool-expansion keybinding (default ctrl+o). The keyhint
	// adapts to user overrides in keybindings.json automatically.
	const expandHint = !expanded
		? ` ${theme.fg("dim", `(${keyHint("app.tools.expand", "to expand")})`)}`
		: "";
	const head = `${tag} ${theme.bold(d.file)} — ${counts.join(", ")} · ${d.mode}${expandHint}`;
	return pips ? `${head}\n  ${theme.fg("dim", pips)}` : head;
}

function formatExpanded(d: GuardrailMessageDetails, theme: Theme): string {
	const lines: string[] = [];
	if (d.unknownIds.length) {
		lines.push(
			theme.fg(
				"warning",
				`  ⚠ Unknown IDs: ${d.unknownIds.join(", ")} — possible drift, consider /dld-audit`,
			),
		);
	}
	for (const dec of d.decisions) {
		const glyph = STATUS_GLYPHS[dec.status] ?? "?";
		lines.push(`  ${theme.bold(dec.id)} ${glyph} ${dec.status} — ${dec.title}`);
		if (dec.tags.length) {
			lines.push(theme.fg("dim", `    ${dec.tags.map((t) => `#${t}`).join(" ")}`));
		}
		if (dec.supersedes.length) {
			lines.push(theme.fg("dim", `    supersedes ${dec.supersedes.join(", ")}`));
		}
		if (dec.amends.length) {
			lines.push(theme.fg("dim", `    amends ${dec.amends.join(", ")}`));
		}
	}
	return lines.join("\n");
}
