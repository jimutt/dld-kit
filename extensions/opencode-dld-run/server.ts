// @decision(DL-016) @decision(DL-017)
// OpenCode V2 server plugin: the dld-run loop driver.
//
// Subscribes to session.execution.succeeded, reads the active run from
// .dld/runs/ via the shared bash scripts, and dispatches continuation
// prompts through ctx.session.prompt. The state layer is identical to
// the Pi extension — same scripts, same .dld/runs/ layout, same jq.
//
// The workspace root comes from session.location.directory, not
// process.cwd() — the plugin runs in OpenCode's server process, which
// may have a different working directory than the project.

import { Plugin } from "@opencode-ai/plugin";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

function projectRoot(cwd: string): string {
	try {
		return execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf-8" }).trim();
	} catch {
		return cwd;
	}
}

function packageRoot(): string {
	const url = new URL(import.meta.url);
	return url.pathname.replace(/\/extensions\/opencode-dld-run\/server\.ts$/, "");
}

function scriptPath(name: string): string {
	return join(packageRoot(), "skills", "dld-run", "scripts", name);
}

// Exec shim: run a script, return {code, stdout, stderr} without throwing.
// @decision(DL-017)
function runScript(
	name: string,
	args: string[],
	cwd: string,
): { code: number; stdout: string; stderr: string } {
	try {
		const stdout = execSync(
			`bash "${scriptPath(name)}" ${args.map((a) => `"${a}"`).join(" ")}`,
			{ cwd, encoding: "utf-8", timeout: 30_000, stdio: ["pipe", "pipe", "pipe"] },
		);
		return { code: 0, stdout, stderr: "" };
	} catch (e: unknown) {
		const err = e as { status?: number; stdout?: string; stderr?: string };
		return { code: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? String(e) };
	}
}

interface RunState {
	schemaVersion: number;
	slug: string;
	title: string;
	status: string;
	items: { status: string; decisions: { id: string }[] }[];
	bounds: { maxItems: number; maxMinutes: number };
}

interface StartArgs {
	slug: string;
	title: string;
	decisionIds: string[];
}

// @decision(DL-019)
// Ported from the Pi extension's parseStartArgs. The agent is the parser:
// ranges expand, slug and title are derived when not given.
//
//   /dld-run start DL-014..DL-022          → slug dl-14-22, 9 items
//   /dld-run start DL-014 - DL-022         → same
//   /dld-run start my-batch DL-014 DL-015  → slug my-batch, 2 items
//   /dld-run start my-batch --decisions DL-014,DL-015
function parseStartArgs(tokens: string[]): StartArgs | { error: string } {
	if (tokens.length === 0) {
		return { error: "Usage: /dld-run start <DL-NNN..DL-NNN | slug [title] decisions…>" };
	}

	// Range form: DL-014..DL-022 or DL-014 - DL-022 (spaces tolerated).
	const joined = tokens.join(" ");
	const rangeMatch = joined.match(/^(DL-\d+)\s*(?:\.\.|-|–|—|to)\s*(DL-\d+)$/i);
	if (rangeMatch) {
		const from = Number(rangeMatch[1]!.slice(3));
		const to = Number(rangeMatch[2]!.slice(3));
		if (!Number.isInteger(from) || !Number.isInteger(to) || from > to || to - from > 50) {
			return { error: `Invalid range: ${rangeMatch[1]}..${rangeMatch[2]}` };
		}
		const ids = Array.from({ length: to - from + 1 }, (_, i) => `DL-${String(from + i).padStart(3, "0")}`);
		return { slug: `dl-${from}-${to}`, title: `${rangeMatch[1]} through ${rangeMatch[2]}`, decisionIds: ids };
	}

	const decisionFlag = tokens.indexOf("--decisions");
	const firstIsDecision = /^DL-\d+$/.test(tokens[0] ?? "");
	let decisionIds: string[];
	let titleParts: string[];

	if (decisionFlag >= 0) {
		decisionIds = (tokens[decisionFlag + 1] ?? "").split(",").filter(Boolean);
		titleParts = tokens.slice(1, decisionFlag);
	} else {
		// When the first token is a decision ID there is no explicit slug —
		// every positional token is a decision.
		const source = firstIsDecision ? tokens : tokens.slice(1);
		decisionIds = source.filter((p) => /^DL-\d+$/.test(p));
		titleParts = source.filter((p) => !/^DL-\d+$/.test(p));
	}

	if (decisionIds.length === 0) {
		return { error: "A run needs decisions. Try /dld-run start DL-014..DL-022 or /dld-run start my-batch DL-014 DL-015" };
	}

	const slug = firstIsDecision
		? `dl-${decisionIds[0]!.slice(3).padStart(3, "0")}-${decisionIds[decisionIds.length - 1]!.slice(3).padStart(3, "0")}`
		: (tokens[0] ?? "run");
	const title = titleParts.join(" ") || (firstIsDecision ? `${decisionIds[0]} batch` : slug);
	return { slug, title, decisionIds };
}

function readRunState(runDir: string): RunState | undefined {
	const statePath = join(runDir, "state.json");
	if (!existsSync(statePath)) return undefined;
	try {
		const raw = JSON.parse(readFileSync(statePath, "utf-8"));
		if (raw.schemaVersion !== 1) return undefined;
		return raw as RunState;
	} catch {
		return undefined;
	}
}

export default Plugin.define({
	id: "dld-run",
	tui: true,
	async setup(ctx) {
		let root = "";
		let dispatched = 0;
		const MAX_DISPATCHES = 50;

		// Register the /dld-run command.
		await ctx.command.transform((draft) => {
			draft.add({
				name: "dld-run",
				description: "Drive a goal run: start, pause, resume, stop, status",
				execute: async ({ sessionID, prompt, delivery }) => {
					const args = prompt.text.trim().split(/\s+/);
					const sub = args[0] ?? "status";

					if (!root) {
						const session = await ctx.session.get({ sessionID });
						const dir = (session as { location?: { directory?: string } }).location?.directory;
						if (dir) root = projectRoot(dir);
					}

					// @decision(DL-019)
					if (sub === "start") {
						const existing = runScript("run-state.sh", ["active"], root);
						if (existing.code === 0 && existing.stdout.trim()) {
							await ctx.session.synthetic({
								sessionID,
								text: `[dld-run plugin] A run is already active: ${existing.stdout.trim()}. Relay this to the user as-is.`,
							});
							return;
						}
						const parsed = parseStartArgs(args.slice(1));
						if (!("slug" in parsed)) {
							await ctx.session.synthetic({
								sessionID,
								text: `[dld-run plugin] ${parsed.error} Relay this to the user as-is.`,
							});
							return;
						}
						// Preconditions first: dirty tree, active run, non-proposed
						// decisions, and ID collisions all refuse before anything
						// is created.
						const guard = runScript("guard-preconditions.sh", ["start", "--decisions", parsed.decisionIds.join(",")], root);
						if (guard.code !== 0) {
							await ctx.session.synthetic({
								sessionID,
								text: `[dld-run plugin] Preconditions failed: ${guard.stdout.trim() || guard.stderr.trim()} Relay this to the user as-is.`,
							});
							return;
						}
						const created = runScript("create-run.sh", ["--slug", parsed.slug, "--title", parsed.title], root);
						if (created.code !== 0) {
							await ctx.session.synthetic({
								sessionID,
								text: `[dld-run plugin] Could not create run: ${created.stdout.trim() || created.stderr.trim()} Relay this to the user as-is.`,
							});
							return;
						}
						for (const id of parsed.decisionIds) {
							const added = runScript("run-state.sh", ["add-item", parsed.slug, "--decisions", id], root);
							if (added.code !== 0) {
								await ctx.session.synthetic({
									sessionID,
									text: `[dld-run plugin] Run ${parsed.slug} created but item ${id} failed: ${added.stdout.trim() || added.stderr.trim()} Relay this to the user as-is.`,
								});
								return;
							}
						}
						// Kick the loop: the run is active, so the next
						// execution.succeeded event dispatches item 1. Prompt the
						// agent to start work now rather than waiting for a turn.
						await ctx.session.prompt({
							sessionID,
							text: `Started goal run '${parsed.slug}' — ${parsed.decisionIds.length} item${parsed.decisionIds.length === 1 ? "" : "s"} (${parsed.title}). Begin work on item 1 as the dld-run skill describes.`,
							delivery,
						});
						return;
					}

					if (sub === "status") {
						const active = runScript("run-state.sh", ["active"], root);
						if (active.code !== 0 || !active.stdout.trim()) {
							await ctx.session.synthetic({ sessionID, text: "No active dld run." });
							return;
						}
						const slug = active.stdout.trim();
						const state = readRunState(join(root, ".dld", "runs", slug));
						if (!state) {
							await ctx.session.synthetic({ sessionID, text: `Run ${slug} exists but state is unreadable.` });
							return;
						}
						const done = state.items.filter((i) => i.status === "accepted" || i.status === "skipped").length;
						const current = state.items.find((i) => i.status === "implementing" || i.status === "verifying");
						const statusText = `Run ${slug}: ${done}/${state.items.length} items done` +
							(current ? `, working on ${current.decisions.map((d) => d.id).join(",")}` : "") +
							`, status: ${state.status}`;
						await ctx.session.synthetic({ sessionID, text: statusText });
						return;
					}

					const statusMap: Record<string, string> = { pause: "paused", resume: "active", stop: "complete" };
					if (statusMap[sub]) {
						const active = runScript("run-state.sh", ["active"], root);
						if (active.code !== 0 || !active.stdout.trim()) {
							await ctx.session.synthetic({ sessionID, text: "No active dld run." });
							return;
						}
						const slug = active.stdout.trim();
						const result = runScript("run-state.sh", ["set-status", slug, statusMap[sub]!], root);
						const msg = result.code === 0
							? `Run ${slug} ${sub === "stop" ? "stopped" : sub + "d"}.`
							: `Failed to ${sub} run ${slug}: ${result.stderr}`;
						await ctx.session.synthetic({ sessionID, text: msg });
						return;
					}

					// @decision(DL-019) — plugin messages become agent context, so
					// phrase them so the agent's correct action is to relay, not debug.
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Unknown subcommand: ${sub}. Use start, status, pause, resume, or stop. Relay this to the user as-is.`,
					});
				},
			});
		});

		// The continuation loop.
		const controller = new AbortController();
		void (async () => {
			for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
				if (event.type !== "session.execution.succeeded") continue;
				const sessionID = (event as { data?: { sessionID?: string } }).data?.sessionID;
				if (!sessionID) continue;

				// Resolve the workspace from the session.
				if (!root) {
					try {
						const session = await ctx.session.get({ sessionID });
						const dir = (session as { location?: { directory?: string } }).location?.directory;
						if (dir) root = projectRoot(dir);
					} catch { continue; }
				}

				const active = runScript("run-state.sh", ["active"], root);
				if (active.code !== 0 || !active.stdout.trim()) continue;
				const slug = active.stdout.trim();
				const state = readRunState(join(root, ".dld", "runs", slug));
				if (!state || state.status !== "active") continue;

				// Bounds check.
				const done = state.items.filter((i) => i.status === "accepted" || i.status === "skipped").length;
				if (state.bounds.maxItems > 0 && done >= state.bounds.maxItems) {
					runScript("run-state.sh", ["set-status", slug, "paused"], root);
					continue;
				}

				// Find the next item.
				const next = runScript("next-item.sh", [slug], root);
				if (next.code === 2) {
					runScript("run-state.sh", ["set-status", slug, "paused"], root);
					continue;
				}
				if (next.code !== 0 || !next.stdout.trim()) {
					runScript("run-state.sh", ["set-status", slug, "complete"], root);
					continue;
				}

				if (dispatched >= MAX_DISPATCHES) continue;
				const itemIndex = next.stdout.trim();
				const item = state.items[Number(itemIndex) - 1];
				if (!item) continue;

				// Claim the item.
				runScript("run-state.sh", ["set-item-status", slug, itemIndex, "implementing"], root);

				dispatched++;
				const decisions = item.decisions.map((d) => d.id).join(", ");
				try {
					await ctx.session.prompt({
						sessionID,
						text: `Continue goal run '${slug}'. Work item ${itemIndex} (${decisions}). Implement the decision(s) as the dld-run skill describes.`,
					});
				} catch { /* dispatch failed — the next execution.succeeded will retry */ }
			}
		})().catch(() => {});

		return () => controller.abort();
	},
});
