import { readFileSync } from "node:fs";
import { scriptPath } from "./paths.ts";

// @decision(DL-001) @decision(DL-007)
// The extension reads run state directly and delegates every mutation to the
// skill scripts. The reader below is a pure JSON parse; the writer goes to
// bash. There is deliberately no function in this module that constructs or
// writes a state document.

export const RUN_STATUSES = ["active", "paused", "blocked", "complete", "stopped"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const ITEM_STATUSES = [
	"pending",
	"implementing",
	"verifying",
	"accepted",
	"blocked",
	"skipped",
	"failed",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export interface DecisionPin {
	id: string;
	hash: string;
}

export interface Acceptance {
	annotations: string[];
	checks: string[][];
}

export const RUN_SCHEMA_VERSION = 1;

export interface WorkItem {
	index: number;
	decisions: DecisionPin[];
	status: ItemStatus;
	acceptance: Acceptance;
	attempts: number;
	evidence: unknown[];
}

export interface BlockedQuestion {
	itemIndex: number;
	question: string;
	answer?: string;
}

export interface RunBounds {
	maxItems: number;
	maxMinutes: number;
}

export interface RunState {
	schemaVersion: number;
	slug: string;
	title: string;
	status: RunStatus;
	createdAt: string;
	updatedAt: string;
	bounds: RunBounds;
	review: "enabled" | "disabled";
	currentItem: number | null;
	items: WorkItem[];
	blockedQuestions: BlockedQuestion[];
}

export interface StateError {
	kind: "missing" | "read-error" | "invalid-json" | "invalid-shape";
	detail: string;
}

export type ReadResult = { ok: true; state: RunState } | { ok: false; error: StateError };

export interface EventLineError {
	line: number;
	detail: string;
}

export interface EventParseResult {
	events: unknown[];
	errors: EventLineError[];
}

/**
 * Minutes the run was actually in `active` status, derived from the event
 * log's pause/resume/stop/complete markers. Wall-clock since creation counts
 * overnight pauses; this does not.
 */
export function activeMinutes(state: RunState, events: unknown[]): number {
	const created = Date.parse(state.createdAt);
	if (!Number.isFinite(created)) return 0;

	interface Marker {
		timestamp: number;
		active: boolean;
	}
	const markers: Marker[] = [{ timestamp: created, active: true }];
	for (const event of events) {
		if (typeof event !== "object" || event === null) continue;
		const e = event as Record<string, unknown>;
		const ts = Date.parse(String(e.timestamp ?? ""));
		if (!Number.isFinite(ts)) continue;
		const kind = String(e.type ?? e.kind ?? "");
		if (kind === "run-paused" || kind === "run_paused" || kind === "paused") markers.push({ timestamp: ts, active: false });
		else if (kind === "run-resumed" || kind === "run_resumed" || kind === "resumed") markers.push({ timestamp: ts, active: true });
		else if (kind === "run-completed" || kind === "run-stopped") markers.push({ timestamp: ts, active: false });
	}

	let total = 0;
	for (let i = 0; i < markers.length; i += 1) {
		const marker = markers[i]!;
		if (!marker.active) continue;
		const end = markers[i + 1]?.timestamp ?? Date.now();
		total += Math.max(0, end - marker.timestamp);
	}
	return total / 60000;
}

export interface ExecLike {
	(command: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number; killed?: boolean }>;
}


function validateStateShape(candidate: unknown): candidate is RunState {
	if (typeof candidate !== "object" || candidate === null) return false;
	const run = candidate as Record<string, unknown>;
	if (run.schemaVersion !== RUN_SCHEMA_VERSION) return false;
	if (!RUN_STATUSES.includes(run.status as RunStatus)) return false;
	if (!Array.isArray(run.items)) return false;
	for (const item of run.items as unknown[]) {
		if (typeof item !== "object" || item === null) return false;
		if (!ITEM_STATUSES.includes((item as Record<string, unknown>).status as ItemStatus)) return false;
	}
	return true;
}

export function parseStateText(text: string): ReadResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return {
			ok: false,
			error: {
				kind: "invalid-json",
				detail: error instanceof Error ? error.message : "unparseable state",
			},
		};
	}
	if (!validateStateShape(parsed)) {
		return {
			ok: false,
			error: {
				kind: "invalid-shape",
				detail: "state.json does not match the run contract schema",
			},
		};
	}
	return { ok: true, state: parsed as RunState };
}

export function readRunFrom(runDir: string): ReadResult {
	let text: string;
	try {
		text = readFileSync(`${runDir}/state.json`, "utf8");
	} catch {
		return {
			ok: false,
			error: { kind: "missing", detail: `no state.json in ${runDir}` },
		};
	}
	return parseStateText(text);
}

export function parseEventsText(text: string): EventParseResult {
	const events: unknown[] = [];
	const errors: EventLineError[] = [];
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i += 1) {
		const line = (lines[i] ?? "").trim();
		if (line === "") continue;
		try {
			events.push(JSON.parse(line));
		} catch (error) {
			errors.push({
				line: i + 1,
				detail: error instanceof Error ? error.message : "invalid event line",
			});
		}
	}
	return { events, errors };
}

/** Read the append-only event log directly. There is no delegated path for
 * events, so a wrong read is a bug in one place — not a corrupted record. */
export function readEventsFrom(runDir: string): EventParseResult {
	let text: string;
	try {
		text = readFileSync(`${runDir}/events.jsonl`, "utf8");
	} catch {
		return { events: [], errors: [{ line: -1, detail: `no events.jsonl in ${runDir}` }] };
	}
	return parseEventsText(text);
}

