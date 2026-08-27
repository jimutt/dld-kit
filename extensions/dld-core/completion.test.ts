import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CompletionTracker } from "./completion.ts";
import type { Exec, ExecResult } from "./run-api.ts";
import type { RunState, WorkItem } from "./run-state.ts";

// @decision(DL-024)
// Core-level tests for the completion transaction. A recording fake exec
// simulates the script boundary; assertions check the outcome kind and the
// script calls made.

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
	return {
		index: 1,
		decisions: [{ id: "DL-001", hash: "abc" }],
		status: "verifying",
		acceptance: { annotations: [], checks: [] },
		attempts: 1,
		evidence: [{ type: "test", note: "tests pass" }],
		...overrides,
	};
}

function makeState(items: WorkItem[], review: "enabled" | "disabled" = "disabled"): RunState {
	return {
		schemaVersion: 1,
		slug: "test-run",
		title: "Test",
		status: "active",
		items,
		bounds: { maxItems: 10, maxMinutes: 60 },
		review,
		currentItem: null,
		blockedQuestions: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}

function makeTempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), "dld-completion-test-"));
	mkdirSync(join(dir, ".dld", "runs", "test-run"), { recursive: true });
	writeFileSync(join(dir, ".dld", "runs", "test-run", "events.jsonl"), "");
	return dir;
}

function fakeExec(handlers: Record<string, ExecResult>): { exec: Exec; calls: string[][] } {
	const calls: string[][] = [];
	const exec: Exec = (command, args, cwd) => {
		calls.push(args);
		const script = args[0] ?? "";
		for (const [pattern, result] of Object.entries(handlers)) {
			if (script.includes(pattern)) return result;
		}
		return { code: 0, stdout: "", stderr: "" };
	};
	return { exec, calls };
}

describe("CompletionTracker", () => {
	test("returns none when no item is verifying", async () => {
		const tracker = new CompletionTracker();
		const { exec } = fakeExec({});
		const state = makeState([makeItem({ status: "pending", evidence: [] })]);
		const outcome = await tracker.step(exec, makeTempProject(), "test-run", state);
		expect(outcome.kind).toBe("none");
	});

	test("returns none when evidence hasn't changed", async () => {
		const tracker = new CompletionTracker();
		const { exec } = fakeExec({ "verify-item.sh": { code: 0, stdout: "", stderr: "" } });
		const state = makeState([makeItem()]);
		// First step processes it
		await tracker.step(exec, makeTempProject(), "test-run", state);
		// Second step with same evidence count: skipped
		const outcome = await tracker.step(exec, makeTempProject(), "test-run", state);
		expect(outcome.kind).toBe("none");
	});

	test("infrastructure failure: un-memoizes so the next turn retries", async () => {
		const tracker = new CompletionTracker();
		const { exec } = fakeExec({ "verify-item.sh": { code: 3, stdout: "", stderr: "timed out" } });
		const state = makeState([makeItem()]);
		const first = await tracker.step(exec, makeTempProject(), "test-run", state);
		expect(first.kind).toBe("infrastructure");
		// Same evidence count, but un-memoized — retries
		const second = await tracker.step(exec, makeTempProject(), "test-run", state);
		expect(second.kind).toBe("infrastructure");
	});

	test("review enabled: nags once, then returns none", async () => {
		const tracker = new CompletionTracker();
		const { exec } = fakeExec({ "verify-item.sh": { code: 0, stdout: "", stderr: "" } });
		const state = makeState([makeItem()], "enabled");
		const first = await tracker.step(exec, makeTempProject(), "test-run", state);
		expect(first.kind).toBe("review-required");
		// Same item, same evidence: already nagged
		const second = await tracker.step(exec, makeTempProject(), "test-run", state);
		expect(second.kind).toBe("none");
	});

	test("accepts when review is disabled and verification passes", async () => {
		const tracker = new CompletionTracker();
		const { exec, calls } = fakeExec({
			"verify-item.sh": { code: 0, stdout: "", stderr: "" },
		});
		const item = makeItem();
		const state = makeState([item]);
		const outcome = await tracker.step(exec, makeTempProject(), "test-run", state);
		expect(outcome.kind).toBe("accepted");
		if (outcome.kind === "accepted") {
			expect(outcome.index).toBe(1);
			expect(outcome.decisionIds).toEqual(["DL-001"]);
		}
		// Verify the mutation sequence: verify → set-item-status accepted → repin → event
		const scripts = calls.map((c) => c[0] ?? "");
		expect(scripts.some((s) => s.includes("verify-item.sh"))).toBe(true);
		expect(scripts.some((s) => s.includes("run-state.sh") && calls[scripts.indexOf(s)]!.includes("accepted"))).toBe(true);
	});

	test("retries on first verification failure", async () => {
		const tracker = new CompletionTracker();
		const { exec } = fakeExec({
			"verify-item.sh": { code: 1, stdout: "test failed", stderr: "" },
		});
		const state = makeState([makeItem({ attempts: 1 })]);
		const outcome = await tracker.step(exec, makeTempProject(), "test-run", state);
		expect(outcome.kind).toBe("retrying");
		if (outcome.kind === "retrying") {
			expect(outcome.attempt).toBe(2);
			expect(outcome.output).toBe("test failed");
		}
	});

	test("blocks and pauses on second verification failure", async () => {
		const tracker = new CompletionTracker();
		const { exec, calls } = fakeExec({
			"verify-item.sh": { code: 1, stdout: "still failing", stderr: "" },
		});
		const state = makeState([makeItem({ attempts: 2 })]);
		const outcome = await tracker.step(exec, makeTempProject(), "test-run", state);
		expect(outcome.kind).toBe("blocked");
		// Verify block-item and pause were called
		const scripts = calls.map((c) => c[0] ?? "");
		expect(scripts.some((s) => s.includes("block-item.sh"))).toBe(true);
		expect(scripts.some((s) => s.includes("run-state.sh") && calls[scripts.indexOf(s)]!.includes("paused"))).toBe(true);
	});

	test("clear resets memoization", async () => {
		const tracker = new CompletionTracker();
		const { exec } = fakeExec({ "verify-item.sh": { code: 0, stdout: "", stderr: "" } });
		const state = makeState([makeItem()]);
		await tracker.step(exec, makeTempProject(), "test-run", state);
		// Same evidence: skipped
		const skipped = await tracker.step(exec, makeTempProject(), "test-run", state);
		expect(skipped.kind).toBe("none");
		// After clear: re-processed
		tracker.clear();
		const retried = await tracker.step(exec, makeTempProject(), "test-run", state);
		expect(retried.kind).not.toBe("none");
	});
});
