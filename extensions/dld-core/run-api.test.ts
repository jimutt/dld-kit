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

// ---------------------------------------------------------------------------
// startRun (DL-024 item 3)
// ---------------------------------------------------------------------------

import { startRun } from "./run-api.ts";

describe("startRun", () => {
	test("rejects when a run is already active", async () => {
		const root = makeTempProject();
		const { exec } = recordingExec([
			{ code: 0, stdout: "existing-run\n", stderr: "" }, // active
		]);
		const result = await startRun(exec, root, ["DL-001", "new-run"]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("already active");
	});

	test("rejects on parse failure", async () => {
		const root = makeTempProject();
		const { exec } = recordingExec([
			{ code: 0, stdout: "\n", stderr: "" }, // no active run
		]);
		const result = await startRun(exec, root, ["--bogus-flag"]); // missing value
		expect(result.ok).toBe(false);
	});

	test("rejects when guard preconditions fail", async () => {
		const root = makeTempProject();
		const { exec } = recordingExec([
			{ code: 0, stdout: "\n", stderr: "" }, // active: none
			{ code: 1, stdout: "", stderr: "working tree is dirty" }, // guard
		]);
		const result = await startRun(exec, root, ["DL-001", "test"]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("dirty");
	});

	test("creates and populates on the happy path", async () => {
		const root = makeTempProject();
		const { exec, calls } = recordingExec([
			{ code: 0, stdout: "\n", stderr: "" }, // active: none
			{ code: 0, stdout: "", stderr: "" }, // guard
			{ code: 0, stdout: "", stderr: "" }, // create-run
			{ code: 0, stdout: "", stderr: "" }, // add-item DL-001
			{ code: 0, stdout: "", stderr: "" }, // add-item DL-002
		]);
		const result = await startRun(exec, root, ["DL-001", "DL-002", "test"]);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.slug).toBe("dl-001-002");
			expect(result.itemCount).toBe(2);
		}
	});

	test("rolls back to blocked when add-item fails", async () => {
		const root = makeTempProject();
		const { exec, calls } = recordingExec([
			{ code: 0, stdout: "\n", stderr: "" }, // active: none
			{ code: 0, stdout: "", stderr: "" }, // guard
			{ code: 0, stdout: "", stderr: "" }, // create-run
			{ code: 1, stdout: "", stderr: "DL-002 is not proposed" }, // add-item fails
			{ code: 0, stdout: "", stderr: "" }, // rollback: set-status blocked
		]);
		const result = await startRun(exec, root, ["DL-001", "DL-002", "test"]);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("blocked");
			expect(result.error).toContain("DL-002");
		}
		// The rollback call happened
		expect(calls).toHaveLength(5);
	});

	test("critical message when the rollback itself fails", async () => {
		const root = makeTempProject();
		const { exec } = recordingExec([
			{ code: 0, stdout: "\n", stderr: "" }, // active: none
			{ code: 0, stdout: "", stderr: "" }, // guard
			{ code: 0, stdout: "", stderr: "" }, // create-run
			{ code: 1, stdout: "", stderr: "not proposed" }, // add-item fails
			{ code: 1, stdout: "", stderr: "invalid transition" }, // rollback fails too
		]);
		const result = await startRun(exec, root, ["DL-001", "test"]);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("CRITICAL");
	});
});
