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
import { parseStartArgs } from "./parse-start-args.ts";

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

// ---------------------------------------------------------------------------
// Start flow (DL-024)
// ---------------------------------------------------------------------------

// The full start flow: reject when a run is active, parse args, guard
// preconditions, create the run, add items — with rollback to blocked on
// failure so a half-populated run never goes live. The harness keeps only
// the dispatch kick (how it tells the agent to start working).

export type StartOutcome =
	| { ok: true; slug: string; itemCount: number }
	| { ok: false; error: string };

export async function startRun(
	exec: Exec,
	root: string,
	args: string[],
): Promise<StartOutcome> {
	// Reject when a run is already active.
	const existing = await activeRun(exec, root);
	if (existing.ok && existing.value) {
		return { ok: false, error: `A run is already active: ${existing.value}` };
	}

	const parsed = parseStartArgs(args);
	if (!("slug" in parsed)) return { ok: false, error: parsed.error };

	// Guard preconditions.
	const guard = await guardPreconditions(exec, root, "start", [
		"--decisions",
		parsed.decisionIds.join(","),
	]);
	if (!guard.ok) return { ok: false, error: guard.error };

	// Create.
	const created = await createRun(exec, root, parsed.slug, parsed.title);
	if (!created.ok) return { ok: false, error: created.error };

	// Add items — roll back to blocked on failure. If the rollback itself
	// fails the run is ACTIVE and half-populated: say so explicitly.
	for (const id of parsed.decisionIds) {
		const added = await addItem(exec, root, parsed.slug, id);
		if (!added.ok) {
			const blocked = await setRunStatus(exec, root, parsed.slug, "blocked");
			const note = blocked.ok
				? "The run is blocked; add the missing items manually or recreate it."
				: "CRITICAL: the run is still ACTIVE and half-populated — stop it manually with run-state.sh set-status before doing anything else.";
			return {
				ok: false,
				error: `Run ${parsed.slug} created but item ${id} failed: ${added.error} ${note}`,
			};
		}
	}

	return { ok: true, slug: parsed.slug, itemCount: parsed.decisionIds.length };
}

// ---------------------------------------------------------------------------
// Lifecycle operations — status + event, paired (DL-024)
// ---------------------------------------------------------------------------

// Each lifecycle transition sets the run status AND appends the matching
// event. The pairing is the invariant: activeMinutes derives from
// run-paused/run-resumed markers, and a status change without its event
// silently corrupts the count. Harnesses call these instead of pairing
// setRunStatus + appendRunEvent by hand.

export async function pauseRun(exec: Exec, root: string, slug: string, reason?: string): Promise<Result> {
	const s = await setRunStatus(exec, root, slug, "paused");
	if (!s.ok) return s;
	return appendRunEvent(exec, root, slug, "run-paused", reason ? { reason } : undefined);
}

export async function resumeRun(exec: Exec, root: string, slug: string): Promise<Result> {
	const s = await setRunStatus(exec, root, slug, "active");
	if (!s.ok) return s;
	return appendRunEvent(exec, root, slug, "run-resumed");
}

export async function stopRun(exec: Exec, root: string, slug: string): Promise<Result> {
	const s = await setRunStatus(exec, root, slug, "stopped");
	if (!s.ok) return s;
	return appendRunEvent(exec, root, slug, "run-stopped");
}

export async function completeRun(exec: Exec, root: string, slug: string): Promise<Result> {
	const s = await setRunStatus(exec, root, slug, "complete");
	if (!s.ok) return s;
	return appendRunEvent(exec, root, slug, "run-completed");
}
