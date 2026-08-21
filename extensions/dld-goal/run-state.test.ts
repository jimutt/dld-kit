import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	parseEventsText,
	parseStateText,
	readEventsFrom,
	readRunFrom,
	stateMutations,
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

describe("delegation", () => {
	test("every mutation executes the skill script, nothing else", async () => {
		const pi = createFakePi();
		const m = stateMutations((c, a) => pi.api.exec(c, a));

		await m.setStatus("payments", "paused");
		await m.setItemStatus("payments", 2, "verifying");
		await m.addEvidence("payments", 2, '{"annotations":"ok"}');
		await m.appendEvent("payments", "item_accepted", '{"index":2}');

		expect(pi.execCalls).toHaveLength(4);
		for (const call of pi.execCalls) {
			expect(call.command).toBe("bash");
			// args[0] is the absolute script path; args[1..] is the operation.
			expect(call.args[0]).toContain("skills/dld-goal/scripts/");
		}
		expect(pi.execCalls[0]?.args[0]).toContain("run-state.sh");
		expect(pi.execCalls[3]?.args[0]).toContain("append-event.sh");
	});

	test("mutation failures surface script stderr rather than throwing", async () => {
		const pi = createFakePi();
		pi.onExec({ command: "bash" }, { stdout: "", stderr: "Validate failed", code: 1 });
		const m = stateMutations((c, a) => pi.api.exec(c, a));

		const result = await m.setStatus("payments", "paused");
		expect(result.ok).toBe(false);
		expect(result.output).toBe("Validate failed");
	});

	test("argv is passed positionally, not assembled into a string", async () => {
		const pi = createFakePi();
		const m = stateMutations((c, a) => pi.api.exec(c, a));

		await m.addItem("payments", {
			decisions: ["DL-010", "DL-011"],
			annotations: ["src/billing.ts"],
			checks: [["npm", "test", "--", "src/billing"]],
		});

		const call = pi.execCalls[0];
		expect(call?.args).toEqual([
			expect.stringContaining("run-state.sh"),
			"add-item",
			"payments",
			"--decisions",
			"DL-010,DL-011",
			"--annotation",
			"src/billing.ts",
			"--check",
			"npm test -- src/billing",
		]);
	});

	test("verify-hashes forwards the --all flag through argv", async () => {
		const pi = createFakePi();
		const m = stateMutations((c, a) => pi.api.exec(c, a));

		await m.verifyHashes("payments", true);

		expect(pi.execCalls[0]?.args.slice(-1)).toEqual(["--all"]);
	});

	test("argv carries the operation in order, not just the flags", async () => {
		const pi = createFakePi();
		const m = stateMutations((c, a) => pi.api.exec(c, a));

		await m.setStatus("payments", "blocked");

		const call = pi.execCalls[0];
		expect(call?.args).toEqual([expect.stringContaining("run-state.sh"), "set-status", "payments", "blocked"]);
	});

	test("stdout is preferred; stderr is the detail when there is no stdout", async () => {
		const pi = createFakePi();
		pi.onExec({ command: "bash" }, { stdout: "", stderr: "run not found", code: 1 });
		const m = stateMutations((c, a) => pi.api.exec(c, a));

		const result = await m.getStatus("ghost");
		expect(result.ok).toBe(false);
		expect(result.output).toContain("run not found");
	});

	test("next-item failure code is the signal to pause, and output carries the operator question", async () => {
		const pi = createFakePi();
		pi.onExec({ command: "bash" }, { code: 2, stderr: "item 3 is blocked: How do I answer this?", stdout: "" });
		const m = stateMutations((c, a) => pi.api.exec(c, a));

		const result = await m.nextItem("payments");
		expect(result.ok).toBe(false);
		expect(result.code).toBe(2);
		expect(result.output).toContain("blocked");
	});

	test("block-item sends reason and question as flags, not positional text", async () => {
		const pi = createFakePi();
		const m = stateMutations((c, a) => pi.api.exec(c, a));

		await m.blockItem("payments", 3, "test caught env missing", { question: "set up the sandbox?", force: true });
		await m.resolveBlock("payments", 3, "done, sandbox ready", "retry");

		const block = pi.execCalls[0];
		expect(block?.args).toEqual([
			expect.stringContaining("block-item.sh"),
			"payments",
			"3",
			"--reason",
			"test caught env missing",
			"--question",
			"set up the sandbox?",
			"--force",
		]);
		const resolve = pi.execCalls[1];
		expect(resolve?.args).toEqual([
			expect.stringContaining("resolve-block.sh"),
			"payments",
			"3",
			"--answer",
			"done, sandbox ready",
			"--action",
			"retry",
		]);
	});

	test("block-item without question or force passes only the reason", async () => {
		const pi = createFakePi();
		const m = stateMutations((c, a) => pi.api.exec(c, a));

		await m.blockItem("payments", 3, "times out");

		const call = pi.execCalls[0];
		expect(call?.args).toEqual([
			expect.stringContaining("block-item.sh"),
			"payments",
			"3",
			"--reason",
			"times out",
		]);
	});

	test("append-event omits --data when no payload is provided", async () => {
		const pi = createFakePi();
		const m = stateMutations((c, a) => pi.api.exec(c, a));

		await m.appendEvent("payments", "run_paused", "");
		await m.appendEvent("payments", "item_accepted", '{"index":1}');

		expect(pi.execCalls[0]?.args).toEqual([expect.stringContaining("append-event.sh"), "payments", "run_paused"]);
		expect(pi.execCalls[1]?.args).toEqual([
			expect.stringContaining("append-event.sh"),
			"payments",
			"item_accepted",
			"--data",
			'{"index":1}',
		]);
	});
});
