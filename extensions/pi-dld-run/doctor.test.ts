import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { formatDoctorReport, runDoctor } from "./doctor.ts";
import dldGoalExtension from "./index.ts";
import { createFakePi } from "./testing/fake-pi.ts";

let workspace: string;

beforeEach(() => {
	workspace = mkdtempSync(join(tmpdir(), "dld-run-doctor-"));
});

afterEach(() => {
	rmSync(workspace, { recursive: true, force: true });
});

function check(report: Awaited<ReturnType<typeof runDoctor>>, name: string) {
	const found = report.checks.find((c) => c.name === name);
	if (!found) throw new Error(`no check named ${name}`);
	return found;
}

describe("runDoctor", () => {
	test("reports ready when every dependency is present", async () => {
		writeFileSync(join(workspace, "dld.config.yaml"), "decisions_dir: decisions\n");
		const pi = createFakePi();

		const report = await runDoctor((c, a, o) => pi.api.exec(c, a, o), workspace);

		expect(report.ok).toBe(true);
		expect(report.checks.every((c) => c.ok)).toBe(true);
	});

	test("fails when jq is missing, since run state depends on it", async () => {
		writeFileSync(join(workspace, "dld.config.yaml"), "decisions_dir: decisions\n");
		const pi = createFakePi();
		pi.onExec({ command: "jq" }, { code: 127, stderr: "command not found" });

		const report = await runDoctor((c, a) => pi.api.exec(c, a), workspace);

		expect(report.ok).toBe(false);
		expect(check(report, "jq").ok).toBe(false);
		expect(check(report, "jq").detail).toContain("not found");
	});

	test("fails when the workspace has no dld.config.yaml and points at /dld-init", async () => {
		const pi = createFakePi();

		const report = await runDoctor((c, a) => pi.api.exec(c, a), workspace);

		expect(check(report, "workspace").ok).toBe(false);
		expect(check(report, "workspace").detail).toContain("/dld-init");
	});

	test("reports missing skill scripts by name", async () => {
		writeFileSync(join(workspace, "dld.config.yaml"), "decisions_dir: decisions\n");
		const pi = createFakePi();

		const report = await runDoctor((c, a, o) => pi.api.exec(c, a, o), workspace, {
			missingScripts: () => ["next-item.sh", "run-state.sh"],
		});

		expect(report.ok).toBe(false);
		expect(check(report, "skill scripts").detail).toBe("missing: next-item.sh, run-state.sh");
	});

	test("distinguishes a broken dependency from an absent one", async () => {
		writeFileSync(join(workspace, "dld.config.yaml"), "decisions_dir: decisions\n");
		const pi = createFakePi();
		pi.onExec({ command: "jq" }, { code: 1, stderr: "jq: error while loading shared libraries\n" });

		const report = await runDoctor((c, a, o) => pi.api.exec(c, a, o), workspace);

		expect(check(report, "jq").detail).toContain("exit 1");
		expect(check(report, "jq").detail).toContain("shared libraries");
	});

	test("treats a killed probe as a timeout rather than a missing binary", async () => {
		writeFileSync(join(workspace, "dld.config.yaml"), "decisions_dir: decisions\n");
		const pi = createFakePi();
		pi.onExec({ command: "bash" }, { killed: true, code: 143 });

		const report = await runDoctor((c, a, o) => pi.api.exec(c, a, o), workspace);

		expect(check(report, "bash").ok).toBe(false);
		expect(check(report, "bash").detail).toBe("bash timed out");
	});

	test("probes carry a timeout so a hung binary cannot hang the command", async () => {
		const pi = createFakePi();

		await runDoctor((c, a, o) => pi.api.exec(c, a, o), workspace);

		expect(pi.execCalls.length).toBeGreaterThan(0);
		for (const call of pi.execCalls) {
			expect(call.options?.timeout).toBe(5000);
		}
	});

	test("a probe that throws is reported as missing rather than crashing", async () => {
		writeFileSync(join(workspace, "dld.config.yaml"), "decisions_dir: decisions\n");
		const pi = createFakePi();
		pi.setExec(() => {
			throw new Error("spawn ENOENT");
		});

		const report = await runDoctor((c, a) => pi.api.exec(c, a), workspace);

		expect(report.ok).toBe(false);
		expect(check(report, "bash").ok).toBe(false);
	});

	test("reports the first line of a multi-line version banner", async () => {
		writeFileSync(join(workspace, "dld.config.yaml"), "decisions_dir: decisions\n");
		const pi = createFakePi();
		pi.onExec({ command: "bash" }, { stdout: "GNU bash, version 5.2.15\nCopyright (C) 2022\n" });

		const report = await runDoctor((c, a) => pi.api.exec(c, a), workspace);

		expect(check(report, "bash").detail).toBe("GNU bash, version 5.2.15");
	});
});

describe("formatDoctorReport", () => {
	test("aligns check names and leads with overall state", async () => {
		writeFileSync(join(workspace, "dld.config.yaml"), "decisions_dir: decisions\n");
		const pi = createFakePi();

		const text = formatDoctorReport(await runDoctor((c, a) => pi.api.exec(c, a), workspace));
		const lines = text.split("\n");

		expect(lines[0]).toContain("dld-run ready");
		expect(lines.slice(1).every((l) => l.startsWith("ok  "))).toBe(true);
	});

	test("marks failures so they are visible in a wall of ok lines", async () => {
		const pi = createFakePi();

		const text = formatDoctorReport(await runDoctor((c, a) => pi.api.exec(c, a), workspace));

		expect(text).toContain("dld-run not ready");
		expect(text).toContain("FAIL workspace");
	});
});

describe("extension registration", () => {
	test("registers the doctor command", () => {
		const pi = createFakePi();
		dldGoalExtension(pi.api);

		expect(pi.commands.has("dld-run-doctor")).toBe(true);
		expect(pi.commands.get("dld-run-doctor")?.description).toContain("bash, jq");
	});

	test("the command notifies with a report and warns when not ready", async () => {
		const pi = createFakePi({ cwd: workspace });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run-doctor");

		expect(pi.notifications).toHaveLength(1);
		expect(pi.notifications[0]?.type).toBe("warning");
		expect(pi.notifications[0]?.message).toContain("dld-run not ready");
	});

	test("falls back to an entry when there is no UI, instead of reporting nothing", async () => {
		const pi = createFakePi({ cwd: workspace, hasUI: false });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run-doctor");

		expect(pi.notifications).toHaveLength(0);
		expect(pi.entries).toHaveLength(1);
		expect(pi.entries[0]?.customType).toBe("dld-run-doctor");
		expect((pi.entries[0]?.data as { text: string }).text).toContain("dld-run not ready");
	});

	test("the command reports info level when the workspace is configured", async () => {
		writeFileSync(join(workspace, "dld.config.yaml"), "decisions_dir: decisions\n");
		const pi = createFakePi({ cwd: workspace });
		dldGoalExtension(pi.api);

		await pi.invokeCommand("dld-run-doctor");

		expect(pi.notifications[0]?.type).toBe("info");
	});
});
