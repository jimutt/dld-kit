import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import dldRunExtension from "./index.ts";
import { createFakePi } from "./testing/fake-pi.ts";

let workspace: string;

beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), "dld-run-findings-"));
});

afterEach(() => {
	rmSync(workspace, { recursive: true, force: true });
});

function writeRun(slug: string, status = "active") {
	const runDir = join(workspace, ".dld", "runs", slug);
	mkdirSync(runDir, { recursive: true });
	writeFileSync(
		join(runDir, "state.json"),
		JSON.stringify({
			schemaVersion: 1,
			slug,
			title: slug,
			status,
			createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
			updatedAt: new Date().toISOString(),
			bounds: { maxItems: 0, maxMinutes: 0 },
			review: "disabled",
			currentItem: null,
			items: [],
			blockedQuestions: [],
		}),
	);
	writeFileSync(join(runDir, "contract.md"), "# test\n");
	writeFileSync(join(runDir, "events.jsonl"), "");
	return runDir;
}

describe("dld_run_note tool", () => {
	test("registers at load", () => {
		const pi = createFakePi();
		dldRunExtension(pi.api);
		expect(pi.tools.has("dld_run_note")).toBe(true);
	});

	test("appends a finding through the script when a run is active", async () => {
		writeRun("payments");
		const pi = createFakePi({ cwd: workspace, hasUI: true });
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "payments\n", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["add-finding.sh"] }, { stdout: "ok\n", code: 0 });
		dldRunExtension(pi.api);

		const tool = pi.tools.get("dld_run_note") as { execute: (id: string, params: Record<string, unknown>, signal: unknown, onUpdate: unknown, ctx: unknown) => Promise<{ content: { text: string }[] }> };
		const result = await tool.execute("1", { note: "The backend lacks a timeout parameter.", item: 1, decisions: "DL-001" }, undefined, undefined, undefined);

		expect(result.content[0]?.text).toBe("Finding recorded.");
		const addCalls = pi.execCalls.filter((c) => c.args.some((a) => a.includes("add-finding.sh")));
		expect(addCalls).toHaveLength(1);
		expect(addCalls[0]?.args).toContain("--note");
		expect(addCalls[0]?.args).toContain("The backend lacks a timeout parameter.");
	});

	test("refuses when no run is active", async () => {
		const pi = createFakePi({ cwd: workspace, hasUI: true });
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "", code: 1 });
		dldRunExtension(pi.api);

		const tool = pi.tools.get("dld_run_note") as { execute: (id: string, params: Record<string, unknown>, signal: unknown, onUpdate: unknown, ctx: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }> };
		const result = await tool.execute("1", { note: "test" }, undefined, undefined, undefined);

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("No active run");
	});
});

describe("completion surfacing", () => {
	test("a completed run with findings shows a card", async () => {
		writeRun("payments");
		const pi = createFakePi({ cwd: workspace, hasUI: true });
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "payments\n", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["next-item.sh"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["set-status"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["append-event.sh"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["get-findings.sh", "--count"] }, { stdout: "2\n", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["get-findings.sh"] }, { stdout: "# Findings\n**Item 1** · 2026-08-25T12:00:00Z\nThe backend lacks a timeout.\n", code: 0 });
		dldRunExtension(pi.api);

		await pi.emit("agent_end", {});

		expect(pi.entries.some((e) => e.customType === "dld-run-card")).toBe(true);
		const card = pi.entries.find((e) => e.customType === "dld-run-card");
		expect((card?.data as { lines: string[] }).lines.join("\n")).toContain("2 findings recorded");
	});

	test("a completed run without findings shows no card", async () => {
		writeRun("payments");
		const pi = createFakePi({ cwd: workspace, hasUI: true });
		pi.onExec({ command: "bash", argsContain: ["run-state.sh", "active"] }, { stdout: "payments\n", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["next-item.sh"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["set-status"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["append-event.sh"] }, { stdout: "", code: 0 });
		pi.onExec({ command: "bash", argsContain: ["get-findings.sh", "--count"] }, { stdout: "0\n", code: 0 });
		dldRunExtension(pi.api);

		await pi.emit("agent_end", {});

		expect(pi.entries.every((e) => e.customType !== "dld-run-card")).toBe(true);
	});
});
