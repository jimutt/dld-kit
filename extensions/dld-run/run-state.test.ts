import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	parseEventsText,
	parseStateText,
	readEventsFrom,
	readRunFrom,
	type RunState,
} from "./run-state.ts";
import { createFakePi } from "./testing/fake-pi.ts";

let workspace: string;

beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), "dld-run-state-"));
});

afterEach(() => {
	rmSync(workspace, { recursive: true, force: true });
});

function validState(overrides: Partial<RunState> = {}): RunState {
	return {
		schemaVersion: 1,
		slug: "payments",
		title: "Payment gateway",
		status: "active",
		createdAt: "2026-08-20T20:15:30Z",
		updatedAt: "2026-08-20T21:02:11Z",
		bounds: { maxItems: 8, maxMinutes: 120 },
		review: "enabled",
		currentItem: null,
		items: [],
		blockedQuestions: [],
		...overrides,
	};
}

describe("read boundary", () => {
	test("accepts a well-formed run", () => {
		const runDir = join(workspace, ".dld", "runs", "payments");
		mkdirSync(runDir, { recursive: true });
		writeFileSync(join(runDir, "state.json"), JSON.stringify(validState()));
		const result = readRunFrom(runDir);
		expect(result.ok).toBe(true);
		expect((result as { state: RunState }).state.slug).toBe("payments");
	});

	test("missing state.json is a structured miss, not a throw", () => {
		const result = readRunFrom(join(workspace, ".dld", "runs", "ghost"));
		expect(result.ok).toBe(false);
		expect((result as { error: { kind: string } }).error.kind).toBe("missing");
	});

	test("rejects unknown run status instead of letting it flow downstream", () => {
		const text = JSON.stringify({ ...validState(), status: "flying" });
		const result = parseStateText(text);
		expect(result.ok).toBe(false);
		expect((result as { error: { kind: string } }).error.kind).toBe("invalid-shape");
	});

	test("rejects unknown item status even when the run status is valid", () => {
		const text = JSON.stringify({
			...validState(),
			items: [
				{
					index: 1,
					decisions: [],
					status: "swimming",
					acceptance: { annotations: [], checks: [] },
					attempts: 0,
					evidence: [],
				},
			],
		});
		const result = parseStateText(text);
		expect(result.ok).toBe(false);
	});

	test("rejects unparseable JSON with a named kind", () => {
		const result = parseStateText("{ nope");
		expect(result.ok).toBe(false);
		expect((result as { error: { kind: string } }).error.kind).toBe("invalid-json");
	});

	test("rejects a state shape with a schemaVersion the extension does not understand", () => {
		const modern = { ...validState(), schemaVersion: 2 };
		const result = parseStateText(JSON.stringify(modern));
		expect(result.ok).toBe(false);
		expect((result as { error: { kind: string } }).error.kind).toBe("invalid-shape");
	});
});

describe("events", () => {
	test("parses one JSON object per line and tolerates trailing blank lines", () => {
		const parsed = parseEventsText('{"kind":"run_started"}\n{"kind":"item_accepted","index":1}\n\n');
		expect(parsed.events).toEqual([{ kind: "run_started" }, { kind: "item_accepted", index: 1 }]);
		expect(parsed.errors).toEqual([]);
	});

	test("bad lines are flagged with their 1-based line number, not silently dropped", () => {
		const parsed = parseEventsText('{"kind":"a"}\n{bad}\n{"kind":"b"}\n');
		expect(parsed.events).toEqual([{ kind: "a" }, { kind: "b" }]);
		expect(parsed.errors).toHaveLength(1);
		expect(parsed.errors[0]?.line).toBe(2);
	});

	test("missing event log is an explicit result rather than an empty success", () => {
		const parsed = readEventsFrom(join(workspace, ".dld", "runs", "ghost"));
		expect(parsed.errors.length).toBeGreaterThan(0);
	});
});

