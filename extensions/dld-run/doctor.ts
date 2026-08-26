import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExecOptions, ExecResult } from "@earendil-works/pi-coding-agent";
import { missingScripts as defaultMissingScripts, packageRoot, scriptsDir } from "../dld-core/paths.ts";

/** A probe that never returns leaves the command hanging with no way out. */
const PROBE_TIMEOUT_MS = 5000;

export interface DoctorCheck {
	name: string;
	ok: boolean;
	detail: string;
}

export interface DoctorReport {
	checks: DoctorCheck[];
	ok: boolean;
}

type Exec = (command: string, args: string[], options?: ExecOptions) => Promise<ExecResult>;

export interface DoctorDeps {
	/** Overridable so the failure branch is reachable from tests. */
	missingScripts?: () => string[];
}

interface ProbeResult {
	version: string | null;
	detail: string;
}

async function probe(exec: Exec, command: string, args: string[]): Promise<ProbeResult> {
	try {
		const result = await exec(command, args, { timeout: PROBE_TIMEOUT_MS });
		if (result.killed) return { version: null, detail: `${command} timed out` };
		if (result.code !== 0) {
			const reason = result.stderr.trim().split("\n")[0];
			return { version: null, detail: reason ? `exit ${result.code}: ${reason}` : `exit ${result.code}` };
		}
		const version = result.stdout.trim().split("\n")[0] ?? "";
		return { version, detail: version || `${command} present` };
	} catch (error) {
		return { version: null, detail: error instanceof Error ? error.message : "not found on PATH" };
	}
}

/**
 * Runtime readiness of the extension. The extension delegates every state
 * mutation to the skill scripts, so bash, jq, and the scripts themselves are
 * hard requirements rather than nice-to-haves.
 */
export async function runDoctor(exec: Exec, cwd: string, deps: DoctorDeps = {}): Promise<DoctorReport> {
	const missingScripts = deps.missingScripts ?? defaultMissingScripts;
	const checks: DoctorCheck[] = [];

	const bash = await probe(exec, "bash", ["--version"]);
	checks.push({
		name: "bash",
		ok: bash.version !== null,
		detail: bash.detail,
	});

	const jq = await probe(exec, "jq", ["--version"]);
	checks.push({
		name: "jq",
		ok: jq.version !== null,
		detail: jq.version !== null ? jq.detail : `${jq.detail} — required for run state`,
	});

	const missing = missingScripts();
	checks.push({
		name: "skill scripts",
		ok: missing.length === 0,
		detail: missing.length === 0 ? scriptsDir() : `missing: ${missing.join(", ")}`,
	});

	const configPath = join(cwd, "dld.config.yaml");
	const configured = existsSync(configPath);
	checks.push({
		name: "workspace",
		ok: configured,
		detail: configured ? configPath : `no dld.config.yaml in ${cwd} — run /dld-init`,
	});

	return { checks, ok: checks.every((c) => c.ok) };
}

export function formatDoctorReport(report: DoctorReport): string {
	const width = Math.max(...report.checks.map((c) => c.name.length));
	const lines = report.checks.map(
		(check) => `${check.ok ? "ok  " : "FAIL"} ${check.name.padEnd(width)}  ${check.detail}`,
	);
	lines.unshift(`dld-run ${report.ok ? "ready" : "not ready"} · ${packageRoot()}`);
	return lines.join("\n");
}
