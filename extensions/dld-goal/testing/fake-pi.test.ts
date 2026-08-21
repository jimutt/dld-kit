import { describe, expect, test } from "bun:test";
import { createFakePi } from "./fake-pi.ts";

describe("createFakePi", () => {
	test("records command registrations and invokes handlers", async () => {
		const pi = createFakePi();
		let seen = "";
		pi.api.registerCommand("demo", {
			description: "demo",
			handler: async (args) => {
				seen = args;
			},
		});

		expect(pi.commands.has("demo")).toBe(true);
		await pi.invokeCommand("demo", "run payments");
		expect(seen).toBe("run payments");
	});

	test("invoking an unregistered command throws rather than passing silently", async () => {
		const pi = createFakePi();
		await expect(pi.invokeCommand("nope")).rejects.toThrow('No command registered named "nope"');
	});

	test("dispatches an event to every handler, in registration order", async () => {
		const pi = createFakePi();
		const seen: string[] = [];
		pi.api.on("agent_end", () => {
			seen.push("first");
		});
		pi.api.on("agent_end", async () => {
			seen.push("second");
		});

		await pi.emit("agent_end", {});
		expect(seen).toEqual(["first", "second"]);
	});

	test("surfaces results from handlers that return one", async () => {
		const pi = createFakePi();
		pi.api.on("session_before_compact", () => ({ cancel: true }));

		expect(await pi.emit("session_before_compact", {})).toEqual([{ cancel: true }]);
	});

	test("emitting an event with no handlers is a no-op", async () => {
		const pi = createFakePi();
		expect(await pi.emit("agent_end", {})).toEqual([]);
	});

	test("exec records calls and returns success by default", async () => {
		const pi = createFakePi();
		const result = await pi.api.exec("bash", ["--version"]);

		expect(result.code).toBe(0);
		expect(pi.execCalls).toEqual([{ command: "bash", args: ["--version"], options: undefined }]);
	});

	test("scripted exec responses match on command and arguments", async () => {
		const pi = createFakePi();
		pi.onExec({ command: "jq", argsInclude: ["--version"] }, { stdout: "jq-1.7\n" });

		expect((await pi.api.exec("jq", ["--version"])).stdout).toBe("jq-1.7\n");
		expect((await pi.api.exec("jq", ["--other"])).stdout).toBe("");
	});

	test("exec failures are expressed as exit codes, not thrown", async () => {
		const pi = createFakePi();
		pi.onExec({ command: "jq" }, { code: 127, stderr: "not found" });

		const result = await pi.api.exec("jq", ["--version"]);
		expect(result.code).toBe(127);
		expect(result.stderr).toBe("not found");
	});

	test("idle and pending-message state is readable and settable", () => {
		const pi = createFakePi();
		expect(pi.ctx.isIdle()).toBe(true);
		expect(pi.ctx.hasPendingMessages()).toBe(false);

		pi.setIdle(false);
		pi.setPendingMessages(true);
		expect(pi.ctx.isIdle()).toBe(false);
		expect(pi.ctx.hasPendingMessages()).toBe(true);
	});

	test("records notifications, statuses, widgets, messages, and entries", () => {
		const pi = createFakePi();
		pi.ctx.ui.notify("hello", "warning");
		pi.ctx.ui.setStatus("dld-goal", "running");
		pi.ctx.ui.setWidget("dld-goal", ["line one"]);
		pi.api.sendMessage({ customType: "dld-goal", content: "next item", display: true }, { deliverAs: "followUp" });
		pi.api.appendEntry("dld-goal-card", { item: 2 });

		expect(pi.notifications).toEqual([{ message: "hello", type: "warning" }]);
		expect(pi.status("dld-goal")).toBe("running");
		expect(pi.widget("dld-goal")).toEqual(["line one"]);
		expect(pi.messages[0]?.deliverAs).toBe("followUp");
		expect(pi.entries).toEqual([{ customType: "dld-goal-card", data: { item: 2 } }]);
	});

	test("records tool and renderer registrations", () => {
		const pi = createFakePi();
		pi.api.registerEntryRenderer("dld-goal-card", () => ({}) as never);
		pi.api.registerMessageRenderer("dld-goal", () => ({}) as never);
		pi.api.registerTool({
			name: "dld_goal_item_done",
			label: "Item done",
			description: "",
			parameters: { type: "object" } as never,
			execute: async () => ({}) as never,
		});

		expect(pi.entryRenderers.has("dld-goal-card")).toBe(true);
		expect(pi.messageRenderers.has("dld-goal")).toBe(true);
		expect(pi.tools.has("dld_goal_item_done")).toBe(true);
	});

	test("records user messages with their delivery mode", () => {
		const pi = createFakePi();
		pi.api.sendUserMessage("work item 2", { deliverAs: "followUp" });

		expect(pi.userMessages).toEqual([{ content: "work item 2", deliverAs: "followUp" }]);
	});

	test("clearing a status or widget is distinguishable from never setting one", () => {
		const pi = createFakePi();
		expect(pi.statuses.has("dld-goal")).toBe(false);

		pi.ctx.ui.setStatus("dld-goal", "running");
		pi.ctx.ui.setStatus("dld-goal", undefined);

		expect(pi.statuses.has("dld-goal")).toBe(true);
		expect(pi.status("dld-goal")).toBeUndefined();
	});
});
