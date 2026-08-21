import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import dldGoalExtension from "./index.ts";
import { createFakePi } from "./testing/fake-pi.ts";

let workspace: string;

beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), "dld-goal-ui-"));
});

afterEach(() => {
	rmSync(workspace, { recursive: true, force: true });
});

function writeActiveRun(slug: string, items: unknown[] = []) {
	const runDir = join(workspace, ".dld", "runs", slug);
	mkdirSync(runDir, { recursive: true });
	writeFileSync(
		join(runDir, "state.json"),
		JSON.stringify({
			schemaVersion: 1,
			slug,
			title: slug,
			status: "active",
			createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
			updatedAt: new Date().toISOString(),
			bounds: { maxItems: 0, maxMinutes: 120 },
			review: "enabled",
			currentItem: null,
			items,
			blockedQuestions: [],
		}),
	);
}

function piWithRun(slug: string, items: unknown[] = []) {
	writeActiveRun(slug, items);
	const pi = createFakePi({ cwd: workspace, hasUI: true });
	pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: `${slug}\n`, code: 0 });
	return pi;
}

describe("status line and widget", () => {
	test("paints status and widget when a run is active at turn end", async () => {
		const pi = piWithRun("payments", [
			{ index: 1, decisions: [{ id: "DL-010", hash: "x" }], status: "accepted", acceptance: { annotations: [], checks: [] }, attempts: 1, evidence: [] },
			{ index: 2, decisions: [{ id: "DL-011", hash: "x" }], status: "pending", acceptance: { annotations: [], checks: [] }, attempts: 0, evidence: [] },
		]);
		dldGoalExtension(pi.api);

		await pi.emit("turn_end", {});

		expect(pi.status("dld-goal")).toContain("payments 1/2");
		expect(pi.widget("dld-goal-run")).toHaveLength(5);
		expect(pi.widget("dld-goal-run")?.[0]).toContain("dld-goal payments");
	});

	test("clears both surfaces when no run is active", async () => {
		const pi = createFakePi({ cwd: workspace, hasUI: true });
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		dldGoalExtension(pi.api);

		await pi.emit("turn_end", {});

		expect(pi.status("dld-goal")).toBeUndefined();
		expect(pi.widget("dld-goal-run")).toBeUndefined();
	});

	test("does not touch surfaces without a UI", async () => {
		const pi = createFakePi({ cwd: workspace, hasUI: false });
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		dldGoalExtension(pi.api);

		await pi.emit("turn_end", {});

		expect(pi.statuses.size).toBe(0);
		expect(pi.widgets.size).toBe(0);
	});
});

describe("board", () => {
	test("falls back to a notify when there is no UI", async () => {
		const pi = createFakePi({ cwd: workspace, hasUI: false });
		writeActiveRun("payments");
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "payments\n", code: 0 });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-goal", "board");

		expect(pi.notifications.some((n) => n.message.includes("dld-goal board — payments"))).toBe(true);
	});

	test("says so when there is no run", async () => {
		const pi = createFakePi({ cwd: workspace, hasUI: true });
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "list"] }, { stdout: "", code: 0 });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-goal", "board");

		expect(pi.notifications.some((n) => n.message === "No run to show.")).toBe(true);
	});
});

describe("cards", () => {
	test("registering the card renderer happens at load", () => {
		const pi = createFakePi();
		dldGoalExtension(pi.api);
		expect(pi.entryRenderers.has("dld-goal-card")).toBe(true);
	});
});
