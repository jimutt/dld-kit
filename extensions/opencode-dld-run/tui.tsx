// @decision(DL-016) @decision(DL-017)
// OpenCode V2 CLI/TUI plugin: the dld-run UI surfaces.
//
// Renders the run status into the prompt footer and a widget into the
// sidebar. Reads state from .dld/runs/ on disk — the same files the
// server plugin and the bash scripts operate on.

import { Plugin } from "@opencode-ai/plugin/tui";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

function projectRoot(cwd: string): string {
	try {
		return execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf-8" }).trim();
	} catch {
		return cwd;
	}
}

interface RunState {
	schemaVersion: number;
	slug: string;
	title: string;
	status: string;
	createdAt: string;
	items: { status: string; decisions: string[] }[];
	bounds: { maxItems: number; maxMinutes: number };
	blockedQuestions: { itemIndex: number; question: string; answer?: string }[];
}

function readActiveRun(root: string): RunState | undefined {
	const runsDir = join(root, ".dld", "runs");
	if (!existsSync(runsDir)) return undefined;
	try {
		const dirs = readdirSync(runsDir, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name);
		for (const slug of dirs) {
			const statePath = join(runsDir, slug, "state.json");
			if (!existsSync(statePath)) continue;
			const raw = JSON.parse(readFileSync(statePath, "utf-8"));
			if (raw.schemaVersion === 1 && raw.status === "active") return raw as RunState;
		}
	} catch {}
	return undefined;
}

function statusLine(state: RunState): string {
	const done = state.items.filter((i) => i.status === "accepted" || i.status === "skipped").length;
	const total = state.items.length;
	const current = state.items.find((i) => i.status === "implementing" || i.status === "verifying");
	const blocked = state.blockedQuestions.filter((q) => !q.answer).length;
	const elapsed = Math.round((Date.now() - new Date(state.createdAt).getTime()) / 60_000);
	const bounds = state.bounds.maxMinutes > 0 ? ` · ${elapsed}m/${state.bounds.maxMinutes}m` : ` · ${elapsed}m`;
	const currentStr = current ? ` · ${current.decisions.join(",")} ${current.status}` : "";
	const blockedStr = blocked > 0 ? ` · ${blocked} blocked question${blocked === 1 ? "" : "s"}` : "";
	return `◆ ${state.slug} ${done}/${total}${currentStr}${bounds}${blockedStr}`;
}

function widgetLines(state: RunState): string[] {
	const lines: string[] = [];
	const done = state.items.filter((i) => i.status === "accepted" || i.status === "skipped").length;
	lines.push(`◆ ${state.slug} — ${done}/${state.items.length} items`);

	for (const item of state.items.slice(0, 3)) {
		const icon = item.status === "accepted" ? "✔" : item.status === "implementing" ? "▸" : item.status === "verifying" ? "◌" : item.status === "blocked" ? "✖" : "○";
		lines.push(`${icon} ${item.decisions.join(",")} ${item.status}`);
	}
	if (state.items.length > 3) lines.push(`  +${state.items.length - 3} more`);

	// Pad to exactly 5 lines.
	while (lines.length < 5) lines.push("");
	return lines.slice(0, 5);
}

export default Plugin.define({
	id: "dld-run-tui",
	async setup(ctx) {
		const cwd = process.cwd();
		const root = projectRoot(cwd);

		// Status line in the prompt footer.
		ctx.slot({
			replace: "prompt.footer.status",
			render: () => {
				const state = readActiveRun(root);
				if (!state) return "";
				return statusLine(state);
			},
		});

		// Widget in the sidebar.
		ctx.slot({
			replace: "sidebar.content",
			render: () => {
				const state = readActiveRun(root);
				if (!state) return "No active dld run.";
				return widgetLines(state).join("\n");
			},
		});

		// Board overlay via keymap.
		ctx.keymap.layer(() => ({
			mode: "normal",
			commands: [{
				id: "dld-run-board",
				title: "DLD Run Board",
				bind: "ctrl+g b",
				run: () => {
					const state = readActiveRun(root);
					if (!state) {
						ctx.ui.toast.show({ title: "DLD Run", message: "No active run.", variant: "info" });
						return;
					}
					const lines = [
						`Run: ${state.slug}`,
						`Title: ${state.title}`,
						`Status: ${state.status}`,
						`Items:`,
						...state.items.map((item, i) => {
							const icon = item.status === "accepted" ? "✔" : item.status === "implementing" ? "▸" : item.status === "verifying" ? "◌" : item.status === "blocked" ? "✖" : "○";
							return `  ${icon} ${i + 1}. ${item.decisions.join(",")} — ${item.status}`;
						}),
					];
					if (state.blockedQuestions.length > 0) {
						lines.push("", "Questions:");
						for (const q of state.blockedQuestions) {
							lines.push(`  ${q.answer ? "✔" : "?"} item ${q.itemIndex}: ${q.question}${q.answer ? ` — ${q.answer}` : ""}`);
						}
					}
					ctx.ui.dialog.show(() => lines.join("\n"), { size: "large" });
				},
			}],
		}));
	},
});
