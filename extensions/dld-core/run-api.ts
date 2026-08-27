// @decision(DL-022)
// The mutation half of dld-core: a TypeScript-native API over the run
// contract. Every function returns a typed result; no caller interprets
// exit codes, stream contents, or script paths.
//
// The implementation delegates to the bash scripts behind an injectable
// exec. When the scripts are rewritten as TypeScript (the npm package
// move), the function bodies change and no caller notices.

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { packageRoot } from "./paths.ts";

// ---------------------------------------------------------------------------
// The exec seam
// ---------------------------------------------------------------------------

export interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
}

export type Exec = (command: string, args: string[], cwd: string) => ExecResult | Promise<ExecResult>;

// The default exec: argv arrays, no shell. verify-item.sh gets a longer
// timeout and a larger buffer — it runs the project's test suite, and the
// defaults (30s, 1MB) would present as a verification failure and block
// the item. A timeout maps to code 3: infrastructure, not a test failure.
export const defaultExec: Exec = (command, args, cwd) => {
	const isVerify = args[0]?.endsWith("verify-item.sh") ?? false;
	try {
		const stdout = execFileSync(command, args, {
			cwd,
			encoding: "utf-8",
			timeout: isVerify ? 300_000 : 30_000,
			maxBuffer: isVerify ? 16 * 1024 * 1024 : 1024 * 1024,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return { code: 0, stdout, stderr: "" };
	} catch (e: unknown) {
		// execFileSync throws on non-zero exit, timeout, and buffer overflow;
		// the cast is confined here so callers see a uniform envelope.
		const err = e as {
			status?: number | null;
			signal?: string | null;
			stdout?: string;
			stderr?: string;
		};
		if (err.signal === "SIGTERM") {
			return { code: 3, stdout: err.stdout ?? "", stderr: `script timed out` };
		}
		return { code: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? String(e) };
	}
};

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): Result<T> {
	return { ok: true, value };
}
function fail<T>(error: string): Result<T> {
	return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function scriptPath(name: string): string {
	return join(packageRoot(), "skills", "dld-run", "scripts", name);
}

async function run(exec: Exec, script: string, args: string[], cwd: string): Promise<ExecResult> {
	return exec("bash", [scriptPath(script), ...args], cwd);
}

function outputOf(r: ExecResult): string {
	return r.stdout.trim() || r.stderr.trim();
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

export async function createRun(exec: Exec, root: string, slug: string, title: string): Promise<Result<string>> {
	const r = await run(exec, "create-run.sh", ["--slug", slug, "--title", title], root);
	return r.code === 0 ? ok(slug) : fail(outputOf(r));
}

export async function addItem(exec: Exec, root: string, slug: string, decisionId: string): Promise<Result> {
	const r = await run(exec, "run-state.sh", ["add-item", slug, "--decisions", decisionId], root);
	return r.code === 0 ? ok(undefined) : fail(outputOf(r));
}

export async function setRunStatus(exec: Exec, root: string, slug: string, status: string): Promise<Result> {
	const r = await run(exec, "run-state.sh", ["set-status", slug, status], root);
	return r.code === 0 ? ok(undefined) : fail(outputOf(r));
}

/** The active run's slug, or null when no run is active. Script failure is an error, not "no run". */
export async function activeRun(exec: Exec, root: string): Promise<Result<string | null>> {
	const r = await run(exec, "run-state.sh", ["active"], root);
	if (r.code !== 0) return fail(outputOf(r));
	const slug = r.stdout.trim().split("\n")[0]?.trim() ?? "";
	return ok(slug || null);
}

/** The most recent paused or blocked run's slug, or null. */
export async function resumableRun(exec: Exec, root: string): Promise<Result<string | null>> {
	const r = await run(exec, "run-state.sh", ["list"], root);
	if (r.code !== 0) return fail(outputOf(r));
	const lines = r.stdout.split("\n").filter((l) => /\s(paused|blocked)$/.test(l));
	const last = lines[lines.length - 1];
	return ok(last ? (last.split(/\s+/)[0] ?? null) : null);
}

export async function guardPreconditions(exec: Exec, root: string, mode: "start" | "resume", args: string[]): Promise<Result> {
	const r = await run(exec, "guard-preconditions.sh", [mode, ...args], root);
	return r.code === 0 ? ok(undefined) : fail(outputOf(r));
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type NextItem =
	| { kind: "item"; index: number }
	| { kind: "blocked"; reason: string }
	| { kind: "complete" }
	| { kind: "error"; error: string };

export async function nextItem(exec: Exec, root: string, slug: string): Promise<NextItem> {
	const r = await run(exec, "next-item.sh", [slug], root);
	if (r.code === 2) return { kind: "blocked", reason: outputOf(r) };
	if (r.code !== 0) return { kind: "error", error: outputOf(r) };
	const index = Number(r.stdout.trim().split("\n")[0]?.trim());
	if (!Number.isInteger(index) || index < 1) return { kind: "complete" };
	return { kind: "item", index };
}

export async function setItemStatus(exec: Exec, root: string, slug: string, index: number, status: string): Promise<Result> {
	const r = await run(exec, "run-state.sh", ["set-item-status", slug, String(index), status], root);
	return r.code === 0 ? ok(undefined) : fail(outputOf(r));
}

export async function repinItem(exec: Exec, root: string, slug: string, index: number): Promise<Result> {
	const r = await run(exec, "run-state.sh", ["repin-item", slug, String(index)], root);
	return r.code === 0 ? ok(undefined) : fail(outputOf(r));
}

export type VerifyOutcome =
	| { kind: "pass" }
	| { kind: "fail"; output: string }
	| { kind: "infrastructure"; error: string };

export async function verifyItem(exec: Exec, root: string, slug: string, index: number): Promise<VerifyOutcome> {
	const r = await run(exec, "verify-item.sh", [slug, String(index)], root);
	if (r.code === 0) return { kind: "pass" };
	if (r.code === 3) return { kind: "infrastructure", error: r.stderr.trim() || "verification timed out" };
	return { kind: "fail", output: r.stdout.trim() };
}

export async function blockItem(exec: Exec, root: string, slug: string, index: number, reason: string): Promise<Result> {
	const r = await run(exec, "block-item.sh", [slug, String(index), "--reason", reason], root);
	return r.code === 0 ? ok(undefined) : fail(outputOf(r));
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function appendRunEvent(exec: Exec, root: string, slug: string, type: string, data?: unknown): Promise<Result> {
	const args = data === undefined ? [slug, type] : [slug, type, "--data", JSON.stringify(data)];
	const r = await run(exec, "append-event.sh", args, root);
	return r.code === 0 ? ok(undefined) : fail(outputOf(r));
}
