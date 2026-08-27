import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pauseRun, resumeRun, stopRun, completeRun, type Exec, type ExecResult } from "./run-api.ts";

// @decision(DL-024)
// Lifecycle ops pair setRunStatus + appendRunEvent. These tests verify the
// pairing with a recording fake exec — both calls must happen, in order.

function makeTempProject(): string {
	const dir = mkdtempSync(join(tmpdir(), "dld-run-api-test-"));
	mkdirSync(join(dir, ".dld", "runs", "test-run"), { recursive: true });
	writeFileSync(join(dir, ".dld", "runs", "test-run", "state.json"), JSON.stringify({
		schemaVersion: 1, slug: "test-run", title: "Test", status: "active",
		items: [], maxItems: 10, maxMinutes: 60, review: "disabled", createdAt: new Date().toISOString(),
	}));
	writeFileSync(join(dir, ".dld", "runs", "test-run", "events.jsonl"), "");
	return dir;
}

function recordingExec(results: ExecResult[]): { exec: Exec; calls: string[][] } {
	const calls: string[][] = [];
	let i = 0;
	const exec: Exec = (command, args, cwd) => {
		// Record the script args (not the command or script path).
		calls.push(args.slice(1));
		return results[i++] ?? { code: 1, stdout: "", stderr: "no more results" };
	};
	return { exec, calls };
}

describe("lifecycle operations pair status and event", () => {
	test("pauseRun sets paused then appends run-paused", async () => {
		const root = makeTempProject();
		const { exec, calls } = recordingExec([
			{ code: 0, stdout: "", stderr: "" },
			{ code: 0, stdout: "", stderr: "" },
		]);
		const result = await pauseRun(exec, root, "test-run", "user requested");
		expect(result.ok).toBe(true);
		expect(calls).toHaveLength(2);
		expect(calls[0]).toContain("set-status");
		expect(calls[0]).toContain("paused");
		expect(calls[1]).toContain("run-paused");
	});

	test("pauseRun without reason appends a bare event", async () => {
		const root = makeTempProject();
		const { exec, calls } = recordingExec([
			{ code: 0, stdout: "", stderr: "" },
			{ code: 0, stdout: "", stderr: "" },
		]);
		await pauseRun(exec, root, "test-run");
		expect(calls[1]).toContain("run-paused");
		// No --data flag when reason is absent
		expect(calls[1]!.some((a) => a === "--data")).toBe(false);
	});

	test("resumeRun sets active then appends run-resumed", async () => {
		const root = makeTempProject();
		const { exec, calls } = recordingExec([
			{ code: 0, stdout: "", stderr: "" },
			{ code: 0, stdout: "", stderr: "" },
		]);
		const result = await resumeRun(exec, root, "test-run");
		expect(result.ok).toBe(true);
		expect(calls[0]).toContain("active");
		expect(calls[1]).toContain("run-resumed");
	});

	test("stopRun sets stopped then appends run-stopped", async () => {
		const root = makeTempProject();
		const { exec, calls } = recordingExec([
			{ code: 0, stdout: "", stderr: "" },
			{ code: 0, stdout: "", stderr: "" },
		]);
		const result = await stopRun(exec, root, "test-run");
		expect(result.ok).toBe(true);
		expect(calls[0]).toContain("stopped");
		expect(calls[1]).toContain("run-stopped");
	});

	test("completeRun sets complete then appends run-completed", async () => {
		const root = makeTempProject();
		const { exec, calls } = recordingExec([
			{ code: 0, stdout: "", stderr: "" },
			{ code: 0, stdout: "", stderr: "" },
		]);
		const result = await completeRun(exec, root, "test-run");
		expect(result.ok).toBe(true);
		expect(calls[0]).toContain("complete");
		expect(calls[1]).toContain("run-completed");
	});

	test("fails early when the status change fails — no event appended", async () => {
		const root = makeTempProject();
		const { exec, calls } = recordingExec([
			{ code: 1, stdout: "", stderr: "invalid transition" },
		]);
		const result = await pauseRun(exec, root, "test-run");
		expect(result.ok).toBe(false);
		expect(calls).toHaveLength(1);
	});
});
