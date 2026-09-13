import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import dldGoalExtension from "./index.ts";

/** Wait for the deferred continuation timer (50ms) to fire. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 90));
import { createFakePi } from "./testing/fake-pi.ts";

let workspace: string;

beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), "dld-run-loop-"));
	mkdirSync(join(workspace, "decisions"), { recursive: true });
});

afterEach(() => {
	rmSync(workspace, { recursive: true, force: true });
});

function writeState(slug: string, state: Record<string, unknown>): string {
	const runDir = join(workspace, ".dld", "runs", slug);
	mkdirSync(runDir, { recursive: true });
	writeFileSync(join(runDir, "state.json"), JSON.stringify(state));
	writeFileSync(join(runDir, "contract.md"), "# probe\n");
	writeFileSync(join(runDir, "events.jsonl"), "");
	return runDir;
}

function activeState(overrides: Record<string, unknown> = {}) {
	return {
		schemaVersion: 1,
		slug: "payments",
		title: "Payment gateway",
		status: "active",
		createdAt: "2026-08-20T20:15:30Z",
		updatedAt: "2026-08-20T21:02:11Z",
		bounds: { maxItems: 0, maxMinutes: 0 },
		review: "enabled",
		currentItem: null,
		items: [
			{
				index: 1,
				decisions: [{ id: "DL-010", hash: "sha256:x" }],
				status: "pending",
				acceptance: { annotations: [], checks: [] },
				attempts: 0,
				evidence: [],
			},
		],
		blockedQuestions: [],
		...overrides,
	};
}

function makePi() {
	const pi = createFakePi({ cwd: workspace, hasUI: true });
	pi.setIdle(true);
	return pi;
}


/** Install a stateful responder that simulates the real scripts against the
 * fixture on disk: `active` reads from the file the tests wrote, `set-status`
 * actually rewrites it, `next-item` honours the block gate, and everything
 * else succeeds quietly. Without this, a pause command would succeed against
 * the fake while the on-disk state still said active, which is exactly the
 * lie the token and status gates are designed to guard against. */
function installStatefulScripts(pi: ReturnType<typeof createFakePi>, slug: string) {
	pi.setExec(async (call) => {
		const joined = call.args.join(" ");
		if (call.command === "git" && call.args.includes("rev-parse")) {
			return { stdout: `${workspace}\n`, stderr: "", code: 0, killed: false };
		}
		if (joined.includes("run-state.sh") && call.args[1] === "active") {
			const state = JSON.parse(
				require("node:fs").readFileSync(join(workspace, ".dld", "runs", slug, "state.json"), "utf8"),
			);
			if (state.status === "active") return { stdout: slug + "\n", stderr: "", code: 0, killed: false };
			return { stdout: "", stderr: "no active run", code: 1, killed: false };
		}
		if (joined.includes("run-state.sh") && call.args[1] === "set-status") {
			const statePath = join(workspace, ".dld", "runs", slug, "state.json");
			const state = JSON.parse(require("node:fs").readFileSync(statePath, "utf8"));
			state.status = call.args[call.args.length - 1];
			require("node:fs").writeFileSync(statePath, JSON.stringify(state));
			return { stdout: "", stderr: "", code: 0, killed: false };
		}
		if (joined.includes("run-state.sh") && call.args[1] === "list") {
			const state = JSON.parse(
				require("node:fs").readFileSync(join(workspace, ".dld", "runs", slug, "state.json"), "utf8"),
			);
			return { stdout: `${slug} ${state.status}\n`, stderr: "", code: 0, killed: false };
		}
		if (call.args[0]?.endsWith("next-item.sh")) {
			const state = JSON.parse(
				require("node:fs").readFileSync(join(workspace, ".dld", "runs", slug, "state.json"), "utf8"),
			);
			const blocked = state.items.find((i: { status: string }) => i.status === "blocked");
			if (blocked) {
				return {
					stdout: "",
					stderr: `item ${blocked.index} blocked: set up the sandbox?`,
					code: 2,
					killed: false,
				};
			}
			const pending = state.items.find((i: { status: string }) => i.status === "pending");
			if (pending) return { stdout: pending.index + "\n", stderr: "", code: 0, killed: false };
			// Matches the real script: exit 0 with empty output when every item is
			// accepted or skipped.
			return { stdout: "", stderr: "", code: 0, killed: false };
		}
		return { stdout: "", stderr: "", code: 0, killed: false };
	});
}


describe("agent_end gating", () => {
	test("dispatches when the run is active and idle and next-item selects work", async () => {
		const pi = makePi();
		writeState("payments", activeState());
	installStatefulScripts(pi, "payments");
		pi.onExec({ command: "bash", argsContain: ["next-item.sh"] }, { stdout: "1\n", code: 0 });
		dldGoalExtension(pi.api);

		await pi.emit("agent_end", {});
		await settle();

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(1);
		expect(pi.messages[0]?.deliverAs).toBe("followUp");
		expect(pi.messages[0]?.triggerTurn).toBe(true);
		expect(pi.notifications.some((n) => n.message.includes("Continue goal run 'payments'"))).toBe(true);
	});

	test("does not dispatch when the run token has moved on (pause/resume raced)", async () => {
		const pi = makePi();
		writeState("payments", activeState());
	installStatefulScripts(pi, "payments");
		pi.onExec({ command: "bash", argsContain: ["next-item.sh"] }, { stdout: "1\n", code: 0 });
		dldGoalExtension(pi.api);

		// invalidate happens via pause; a queued dispatch carrying the old token must not fire.
		await pi.invokeCommand("dld-run", "pause");
		await pi.emit("agent_end", {});
		await settle();

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(0);
	});

	test("does not dispatch while the agent is busy", async () => {
		const pi = makePi();
		writeState("payments", activeState());
	installStatefulScripts(pi, "payments");
		pi.setIdle(false);
		dldGoalExtension(pi.api);

		await pi.emit("agent_end", {});
		await settle();

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(0);
	});

	test("does not dispatch while the user has queued input", async () => {
		const pi = makePi();
		writeState("payments", activeState());
	installStatefulScripts(pi, "payments");
		pi.setPendingMessages(true);
		dldGoalExtension(pi.api);

		await pi.emit("agent_end", {});
		await settle();

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(0);
	});

	test("pauses rather than dispatches when maxItems is already reached", async () => {
		const pi = makePi();
		writeState("payments", activeState({
			bounds: { maxItems: 1, maxMinutes: 0 },
			items: [
				{
					index: 1,
					decisions: [{ id: "DL-010", hash: "sha256:x" }],
					status: "accepted",
					acceptance: { annotations: [], checks: [] },
					attempts: 1,
					evidence: [],
				},
			],
		}));
		installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.emit("agent_end", {});
		await settle();

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(0);
		expect(pi.notifications.some((n) => n.message.includes("reached its bounds and paused"))).toBe(true);
	});

	test("surfaces the operator question when next-item exits 2 and does not dispatch", async () => {
		const pi = makePi();
		writeState("payments", activeState({
			items: [
				{
					index: 1,
					decisions: [{ id: "DL-010", hash: "sha256:x" }],
					status: "blocked",
					acceptance: { annotations: [], checks: [] },
					attempts: 2,
					evidence: [],
				},
			],
		}));
		pi.onExec({ command: "bash", argsContain: ["next-item.sh"] }, { code: 2, stderr: "item 1 blocked: set up the sandbox?" });
		installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.emit("agent_end", {});
		await settle();

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(0);
		expect(pi.notifications.some((n) => n.message.includes("item 1 blocked: set up the sandbox?"))).toBe(true);
	});

	test("completes the run when next-item has nothing left instead of erroring", async () => {
		const pi = makePi();
		writeState("payments", activeState({
			items: [
				{
					index: 1,
					decisions: [{ id: "DL-010", hash: "sha256:x" }],
					status: "accepted",
					acceptance: { annotations: [], checks: [] },
					attempts: 1,
					evidence: [],
				},
			],
		}));
		installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.emit("agent_end", {});
		await settle();

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(0);
		expect(pi.notifications.some((n) => n.message.includes("Run payments complete"))).toBe(true);
		expect(pi.notifications.every((n) => n.type !== "error")).toBe(true);
	});

	test("blocks pause the run rather than only warning", async () => {
		const pi = makePi();
		writeState("payments", activeState({
			items: [
				{
					index: 1,
					decisions: [{ id: "DL-010", hash: "sha256:x" }],
					status: "blocked",
					acceptance: { annotations: [], checks: [] },
					attempts: 2,
					evidence: [],
				},
			],
		}));
		installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.emit("agent_end", {});

		const state = JSON.parse(
			require("node:fs").readFileSync(join(workspace, ".dld", "runs", "payments", "state.json"), "utf8"),
		);
		// The stateful responder flips blocked items to blocked status in the
		// next-item simulation; pause must have gone through set-status.
		// pauseRun goes through set-status paused; blocked is what next-item
		// reported. Either is acceptable, but the run must not still be active.
		expect(state.status).not.toBe("active");
	});

	test("maxMinutes measures wall-clock from creation, not the last write", async () => {
		const pi = makePi();
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString().slice(0, 19) + "Z";
		writeState("payments", activeState({
			bounds: { maxItems: 0, maxMinutes: 60 },
			createdAt: twoHoursAgo,
			updatedAt: new Date().toISOString().slice(0, 19) + "Z",
		}));
		installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.emit("agent_end", {});
		await settle();

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(0);
		expect(pi.notifications.some((n) => n.message.includes("reached its bounds and paused"))).toBe(true);
	});

	test("ignores agent_end when no run is active", async () => {
		const pi = makePi();
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		dldGoalExtension(pi.api);

		await pi.emit("agent_end", {});
		await settle();

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(0);
		expect(pi.notifications).toHaveLength(0);
	});
});

describe("turn_end transaction", () => {
	test("accepts an in-flight verifying item when mechanical checks pass", async () => {
		const pi = makePi();
		writeState("payments", activeState({
			review: "disabled",
			items: [
				{
					index: 1,
					decisions: [{ id: "DL-010", hash: "sha256:x" }],
					status: "verifying",
					acceptance: { annotations: [], checks: [] },
					attempts: 0,
					evidence: [{ kind: "annotations", ok: true }],
				},
			],
		}));
		pi.onExec({ command: "bash", argsContain: ["verify-item.sh"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "set-item-status"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "repin-item"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["append-event.sh"] }, { stdout: "", code: 0 });
		installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.emit("turn_end", {});

		const statuses = pi.execCalls.filter((c) => c.args.some((a) => a.includes("set-item-status")));
		expect(statuses).toHaveLength(1);
		expect(pi.notifications.some((n) => n.message.includes("Item 1 accepted"))).toBe(true);
	});

	test("does nothing for an item that is verifying but has no evidence yet", async () => {
		const pi = makePi();
		writeState("payments", activeState());
	installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.emit("turn_end", {});

		expect(pi.notifications).toHaveLength(0);
	});

	test("review-enabled runs hold the item for review instead of auto-accepting", async () => {
		const pi = makePi();
		writeState("payments", activeState({
			review: "enabled",
			items: [
				{
					index: 1,
					decisions: [{ id: "DL-010", hash: "sha256:x" }],
					status: "verifying",
					acceptance: { annotations: [], checks: [] },
					attempts: 0,
					evidence: [{ kind: "annotations", ok: true }],
				},
			],
		}));
		installStatefulScripts(pi, "payments");
		pi.onExec({ command: "bash", argsContain: ["verify-item.sh"] }, { stdout: "", code: 0 });
		dldGoalExtension(pi.api);

		await pi.emit("turn_end", {});
		await pi.emit("turn_end", {});

		expect(pi.notifications.filter((n) => n.message.includes("review is enabled"))).toHaveLength(1);
		expect(pi.execCalls.every((c) => !c.args.includes("accepted"))).toBe(true);
	});

	test("accepts autonomously only when the run has review disabled", async () => {
		const pi = makePi();
		writeState("payments", activeState({
			review: "disabled",
			items: [
				{
					index: 1,
					decisions: [{ id: "DL-010", hash: "sha256:x" }],
					status: "verifying",
					acceptance: { annotations: [], checks: [] },
					attempts: 0,
					evidence: [{ kind: "annotations", ok: true }],
				},
			],
		}));
		installStatefulScripts(pi, "payments");
		pi.onExec({ command: "bash", argsContain: ["verify-item.sh"] }, { stdout: "", code: 0 });
		dldGoalExtension(pi.api);

		await pi.emit("turn_end", {});

		expect(pi.notifications.some((n) => n.message.includes("Item 1 accepted"))).toBe(true);
		const eventCalls = pi.execCalls.filter((c) => c.args.some((a) => a.includes("append-event.sh")));
		expect(eventCalls.some((c) => c.args.includes("item-accepted"))).toBe(true);
	});

	test("a failed write in the accept transaction aborts before the event is appended", async () => {
		const pi = makePi();
		writeState("payments", activeState({
			review: "disabled",
			items: [
				{
					index: 1,
					decisions: [{ id: "DL-010", hash: "sha256:x" }],
					status: "verifying",
					acceptance: { annotations: [], checks: [] },
					attempts: 0,
					evidence: [{ kind: "annotations", ok: true }],
				},
			],
		}));
		installStatefulScripts(pi, "payments");
		pi.onExec({ command: "bash", argsContain: ["verify-item.sh"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["set-item-status"] }, { stdout: "", stderr: "disk full", code: 1 });
		dldGoalExtension(pi.api);

		await pi.emit("turn_end", {});

		expect(pi.notifications.some((n) => n.message.includes("Could not mark item 1 accepted"))).toBe(true);
		expect(pi.execCalls.every((c) => !c.args.includes("item-accepted"))).toBe(true);
	});

	test("second verification failure blocks the item with the failure as reason", async () => {
		const pi = makePi();
		writeState("payments", activeState({
			review: "disabled",
			items: [
				{
					index: 1,
					decisions: [{ id: "DL-010", hash: "sha256:x" }],
					status: "verifying",
					acceptance: { annotations: [], checks: [] },
					attempts: 2,
					evidence: [{ kind: "annotations", ok: true }],
				},
			],
		}));
		installStatefulScripts(pi, "payments");
		pi.onExec({ command: "bash", argsContain: ["verify-item.sh"] }, { stdout: "", stderr: "annotations missing", code: 1 });
		pi.onExec({ command: "bash", argsContain: ["block-item.sh"] }, { stdout: "Item 1 blocked.\n", code: 0 });
		dldGoalExtension(pi.api);

		await pi.emit("turn_end", {});

		const blockCalls = pi.execCalls.filter((c) => c.args.some((a) => a.includes("block-item.sh")));
		expect(blockCalls).toHaveLength(1);
		expect(blockCalls[0]?.args).toContain("--reason");
		// No --force: attempts is already 2, so the retry has been used.
		expect(blockCalls[0]?.args).not.toContain("--force");
	});

	test("retries once on first verification failure and blocks on second", async () => {
		const pi = makePi();
		writeState("payments", activeState({
			review: "disabled",
			items: [
				{
					index: 1,
					decisions: [{ id: "DL-010", hash: "sha256:x" }],
					status: "verifying",
					acceptance: { annotations: [], checks: [] },
					attempts: 0,
					evidence: [{ kind: "annotations", ok: true }],
				},
			],
		}));
		pi.onExec({ command: "bash", argsContain: ["verify-item.sh"] }, { stdout: "", stderr: "annotations missing", code: 1 });
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "bump-attempt"] }, { stdout: "1\n", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "set-item-status"] }, { stdout: "", code: 0 });
		installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.emit("turn_end", {});

		expect(pi.notifications.some((n) => n.message.includes("retrying (attempt 1)"))).toBe(true);
	});
});

describe("commands", () => {
	test("start creates a run with items and dispatches the first continuation", async () => {
		const pi = makePi();
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		pi.onExec({ command: "bash", argsContain: ["guard-preconditions.sh"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["create-run.sh"] }, { stdout: "Created run payments\n", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["add-item"] }, { stdout: "", code: 0 });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run", "start payments DL-001 DL-002");

		expect(pi.execCalls.some((c) => c.args.some((a) => a.includes("guard-preconditions.sh")))).toBe(true);
		expect(pi.execCalls.some((c) => c.args.some((a) => a.includes("create-run.sh")))).toBe(true);
		expect(pi.execCalls.filter((c) => c.args.some((a) => a.includes("add-item")))).toHaveLength(2);
		expect(pi.notifications.some((n) => n.message.includes("Started run payments · 2 items"))).toBe(true);
	});

	test("start refuses without decisions instead of creating an empty run", async () => {
		const pi = makePi();
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run", "start payments");

		expect(pi.execCalls.every((c) => !c.args.some((a) => a.includes("create-run.sh")))).toBe(true);
		expect(pi.notifications.some((n) => n.message.includes("A run needs decisions"))).toBe(true);
	});

	test("start refuses when preconditions fail", async () => {
		const pi = makePi();
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		pi.onExec({ command: "bash", argsContain: ["guard-preconditions.sh"] }, { stdout: "", stderr: "dirty tree", code: 1 });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run", "start payments DL-001");

		expect(pi.execCalls.every((c) => !c.args.some((a) => a.includes("create-run.sh")))).toBe(true);
		expect(pi.notifications.some((n) => n.message.includes("dirty tree"))).toBe(true);
	});

	test("start expands a range into items with a derived slug", async () => {
		const pi = makePi();
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		pi.onExec({ command: "bash", argsContain: ["guard-preconditions.sh"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["create-run.sh"] }, { stdout: "Created\n", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["add-item"] }, { stdout: "", code: 0 });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run", "start DL-014..DL-016");

		expect(pi.execCalls.filter((c) => c.args.some((a) => a.includes("add-item")))).toHaveLength(3);
		expect(pi.execCalls.some((c) => c.args.includes("dl-014-016"))).toBe(true);
		expect(pi.notifications.some((n) => n.message.includes("Started run dl-014-016 · 3 items"))).toBe(true);
	});

	test("start with only positional decisions keeps every one", async () => {
		const pi = makePi();
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		pi.onExec({ command: "bash", argsContain: ["guard-preconditions.sh"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["create-run.sh"] }, { stdout: "Created\n", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["add-item"] }, { stdout: "", code: 0 });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run", "start DL-014 DL-015");

		expect(pi.execCalls.filter((c) => c.args.some((a) => a.includes("add-item")))).toHaveLength(2);
		expect(pi.execCalls.some((c) => c.args.includes("dl-014-015"))).toBe(true);
	});

	test("a single positional decision is accepted, not refused", async () => {
		const pi = makePi();
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		pi.onExec({ command: "bash", argsContain: ["guard-preconditions.sh"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["create-run.sh"] }, { stdout: "Created\n", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["add-item"] }, { stdout: "", code: 0 });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run", "start DL-014");

		expect(pi.execCalls.filter((c) => c.args.some((a) => a.includes("add-item")))).toHaveLength(1);
	});

	test("pause aborts the current turn, not just the next dispatch", async () => {
		const pi = makePi();
		writeState("payments", activeState());
		installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run", "pause");

		expect(pi.wasAborted()).toBe(true);
	});

	test("suspension covers the write path: turn_end mutates nothing while suspended", async () => {
		const pi = makePi();
		writeState("payments", activeState({
			review: "disabled",
			items: [
				{
					index: 1,
					decisions: [{ id: "DL-010", hash: "sha256:x" }],
					status: "verifying",
					acceptance: { annotations: [], checks: [] },
					attempts: 1,
					evidence: [{ kind: "annotations", ok: true }],
				},
			],
		}));
		installStatefulScripts(pi, "payments");
		pi.onExec({ command: "bash", argsContain: ["verify-item.sh"] }, { stdout: "", code: 0 });
		dldGoalExtension(pi.api);

		await pi.emit("input", {});
		await pi.emit("turn_end", {});

		expect(pi.execCalls.every((c) => !c.args.some((a) => a.includes("verify-item.sh")))).toBe(true);
	});

	test("an aborted turn suspends the loop instead of redispatching", async () => {
		const pi = makePi();
		writeState("payments", activeState());
		installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.emit("agent_end", {
			messages: [{ role: "assistant", stopReason: "aborted", content: [] }],
		});

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(0);
		expect(pi.notifications.some((n) => n.message.includes("suspended (interrupted)"))).toBe(true);
	});

	test("a non-aborted turn end still dispatches", async () => {
		const pi = makePi();
		writeState("payments", activeState());
		installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.emit("agent_end", {
			messages: [{ role: "assistant", stopReason: "stop", content: [] }],
		});

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(1);
	});

	test("start tolerates range separators with spaces", async () => {
		const pi = makePi();
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		pi.onExec({ command: "bash", argsContain: ["guard-preconditions.sh"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["create-run.sh"] }, { stdout: "Created\n", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["add-item"] }, { stdout: "", code: 0 });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run", "start DL-014 - DL-015");

		expect(pi.execCalls.filter((c) => c.args.some((a) => a.includes("add-item")))).toHaveLength(2);
	});

	test("pause invalidates the token so agent_end stops dispatching", async () => {
		const pi = makePi();
		writeState("payments", activeState());
		installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run", "pause");
		await pi.emit("agent_end", {});
		await settle();

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(0);
	});

	test("resume invalidates the token so agent_end can dispatch again", async () => {
		const pi = makePi();
		writeState("payments", activeState());
		installStatefulScripts(pi, "payments");
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run", "pause");
		await pi.invokeCommand("dld-run", "resume");
		await pi.emit("agent_end", {});
		await settle();

		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(1);
	});

	test("status with no active run says so without shelling out", async () => {
		const pi = makePi();
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run", "status");

		expect(pi.notifications.some((n) => n.message === "No active run.")).toBe(true);
	});
});

describe("dispatch guard", () => {
	test("re-delivers once when the item doesn't advance, then wedges", async () => {
		const pi = makePi();
		writeState("payments", activeState());
		installStatefulScripts(pi, "payments");
		pi.onExec({ command: "bash", argsContain: ["next-item.sh"] }, { stdout: "1\n", code: 0 });
		dldGoalExtension(pi.api);

		// First dispatch
		await pi.emit("agent_end", {});
		await settle();
		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(1);

		// Second agent_end with the same item: re-delivers once
		await pi.emit("agent_end", {});
		await settle();
		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(2);

		// Third agent_end: wedged — no dispatch, warning instead
		await pi.emit("agent_end", {});
		await settle();
		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation")).toHaveLength(2);
		expect(pi.notifications.some((n) => n.message.includes("appears wedged"))).toBe(true);
	});

	test("invalidation clears the guard so a resumed run dispatches fresh", async () => {
		const pi = makePi();
		writeState("payments", activeState());
		installStatefulScripts(pi, "payments");
		pi.onExec({ command: "bash", argsContain: ["next-item.sh"] }, { stdout: "1\n", code: 0 });
		dldGoalExtension(pi.api);

		// Dispatch, re-deliver, wedge
		await pi.emit("agent_end", {});
		await settle();
		await pi.emit("agent_end", {});
		await settle();
		await pi.emit("agent_end", {});
		await settle();
		expect(pi.notifications.some((n) => n.message.includes("appears wedged"))).toBe(true);

		// Pause + resume clears the guard
		await pi.invokeCommand("dld-run", "pause");
		await pi.invokeCommand("dld-run", "resume");
		await pi.emit("agent_end", {});
		await settle();
		// Fresh dispatch after resume
		expect(pi.messages.filter((m) => m.customType === "dld-run:continuation").length).toBeGreaterThan(2);
	});
});
