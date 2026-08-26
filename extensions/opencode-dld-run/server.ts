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

					await ctx.session.synthetic({
						sessionID,
						text: `Unknown subcommand: ${sub}. Use status, pause, resume, or stop.`,
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
