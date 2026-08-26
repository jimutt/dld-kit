/** @jsxImportSource @opentui/solid */
// @decision(DL-016) @decision(DL-017) @decision(DL-020)
// OpenCode V2 CLI/TUI plugin: the dld-run UI surfaces.
//
// The pragma is load-bearing: OpenCode's TUI renders SolidJS, and without
// it bun's default JSX transform emits react/jsx-runtime imports, which
// fail to resolve in projects that don't have React.
//
// Renders the run status into the prompt footer and a widget into the
// sidebar. Reads state from .dld/runs/ on disk — the same files the
// server plugin and the bash scripts operate on.
//
// Keymap layers use Solid's useContext, so they must be created inside a
// component — not in setup(). The pattern (from OpenCode's own storybook
// plugin): claim the "app" slot and render a component that registers the
// layer.

import { Plugin } from "@opencode-ai/plugin/tui";
import { createSignal, type JSX } from "solid-js";
import {
	readFileSync,
	existsSync,
	readdirSync,
	watch,
	type FSWatcher,
} from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function projectRoot(cwd: string): string {
	try {
		return execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			encoding: "utf-8",
		}).trim();
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
	items: { status: string; decisions: { id: string }[] }[];
	bounds: { maxItems: number; maxMinutes: number };
	blockedQuestions?: { itemIndex: number; question: string; answer?: string }[];
}

function readActiveRun(root: string): RunState | undefined {
	const runsDir = join(root, ".dld", "runs");
	if (!existsSync(runsDir)) return undefined;
	try {
		const dirs = readdirSync(runsDir, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name);
		let fallback: RunState | undefined;
		for (const slug of dirs) {
			const statePath = join(runsDir, slug, "state.json");
			if (!existsSync(statePath)) continue;
			const raw = JSON.parse(readFileSync(statePath, "utf-8"));
			if (raw.schemaVersion !== 1) continue;
			// Show active runs first, then paused/blocked — a paused run is
			// exactly when the user needs the status surface.
			if (raw.status === "active") return raw as RunState;
			if (!fallback && (raw.status === "paused" || raw.status === "blocked"))
				fallback = raw as RunState;
		}
		return fallback;
	} catch {}
	return undefined;
}

function itemIcon(status: string): string {
	switch (status) {
		case "accepted":
			return "✔";
		case "implementing":
			return "▸";
		case "verifying":
			return "◌";
		case "blocked":
			return "✖";
		case "skipped":
			return "–";
		default:
			return "○";
	}
}

function statusLine(state: RunState): string {
	const done = state.items.filter(
		(i) => i.status === "accepted" || i.status === "skipped",
	).length;
	const total = state.items.length;
	const current = state.items.find(
		(i) => i.status === "implementing" || i.status === "verifying",
	);
	const blocked = (state.blockedQuestions ?? []).filter(
		(q) => !q.answer,
	).length;
	const elapsed = Math.round(
		(Date.now() - new Date(state.createdAt).getTime()) / 60_000,
	);
	const bounds =
		state.bounds.maxMinutes > 0
			? ` · ${elapsed}m/${state.bounds.maxMinutes}m`
			: ` · ${elapsed}m`;
	const currentStr = current
		? ` · ${current.decisions.map((d) => d.id).join(",")} ${current.status}`
		: "";
	const blockedStr = blocked > 0 ? ` · ${blocked} blocked` : "";
	return `◆ ${state.slug} ${done}/${total}${currentStr}${bounds}${blockedStr}`;
}

function widgetLines(state: RunState): string[] {
	const lines: string[] = [];
	const done = state.items.filter(
		(i) => i.status === "accepted" || i.status === "skipped",
	).length;
	lines.push(`◆ ${state.slug} — ${done}/${state.items.length} items`);

	for (const item of state.items.slice(0, 3)) {
		const icon = itemIcon(item.status);
		lines.push(
			`${icon} ${item.decisions.map((d) => d.id).join(",")} ${item.status}`,
		);
	}
	if (state.items.length > 3) lines.push(`  +${state.items.length - 3} more`);

	while (lines.length < 5) lines.push("");
	return lines.slice(0, 5);
}

function boardText(state: RunState): string {
	const lines = [
		`Run: ${state.slug}`,
		`Title: ${state.title}`,
		`Status: ${state.status}`,
		`Items:`,
		...state.items.map((item, i) => {
			const icon = itemIcon(item.status);
			return `  ${icon} ${i + 1}. ${item.decisions.map((d) => d.id).join(",")} — ${item.status}`;
		}),
	];
	if ((state.blockedQuestions ?? []).length > 0) {
		lines.push("", "Questions:");
		for (const q of state.blockedQuestions ?? []) {
			lines.push(
				`  ${q.answer ? "✔" : "?"} item ${q.itemIndex}: ${q.question}${q.answer ? ` — ${q.answer}` : ""}`,
			);
		}
	}
	return lines.join("\n");
}

// Reactive state: a single signal shared by every surface, refreshed by
// watching .dld/runs/ for writes. The agent mutates state by shelling out
// to the bash scripts mid-turn, so no OpenCode event can drive this — the
// filesystem is the only place every writer is visible. fs.watch on macOS
// coalesces events and reports atomic tmp+rename writes as rename pairs,
// so any event just triggers a full re-read. A slow interval backs the
// watcher up in case it errors or .dld/runs/ appears after setup.
function createRunSignal(root: string) {
	const [state, setState] = createSignal<RunState | undefined>(
		readActiveRun(root),
	);
	const refresh = () => setState(readActiveRun(root));

	let watcher: FSWatcher | undefined;
	try {
		const runsDir = join(root, ".dld", "runs");
		if (existsSync(runsDir)) {
			watcher = watch(runsDir, { recursive: true }, refresh);
			watcher.on("error", () => {
				watcher?.close();
				watcher = undefined;
			});
		}
	} catch {
		watcher = undefined;
	}

	const timer = setInterval(refresh, 10_000);

	// setup() returns () => dispose() as its cleanup, so no onCleanup here —
	// Solid warns rather than throws without an owner, and both paths would
	// double-dispose.
	const dispose = () => {
		watcher?.close();
		clearInterval(timer);
	};
	return { state, dispose };
}

// The board command must live inside a component — keymap layers use
// Solid's useContext, which throws outside the component tree.
function BoardCommand(props: {
	context: Plugin.Context;
	root: string;
}): JSX.Element {
	props.context.keymap.layer(() => ({
		commands: [
			{
				id: "dld-run-board",
				title: "DLD Run Board",
				group: "DLD",
				bind: "ctrl+g b",
				palette: true,
				run: () => {
					const state = readActiveRun(props.root);
					if (!state) {
						props.context.ui.toast.show({
							title: "DLD Run",
							message: "No active run.",
							variant: "info",
						});
						return;
					}
					const text = boardText(state);
					props.context.ui.dialog.show(() => <text>{text}</text>);
				},
			},
		],
	}));
	return null;
}

export default Plugin.define({
	id: "dld-run-tui",
	setup(ctx) {
		const root = projectRoot(process.cwd());
		const { state: run, dispose } = createRunSignal(root);

		// Status line in the prompt footer. The signal read must be inside
		// the JSX expression — Solid untracks component bodies, so a read
		// assigned to a const never re-runs and the surface goes stale.
		ctx.ui.slot({
			replace: "prompt.footer.status",
			render: () => <text>{run() ? statusLine(run()!) : ""}</text>,
		});

		// Widget in the sidebar. Same reactivity rule.
		ctx.ui.slot({
			replace: "sidebar.content",
			render: () => (
				<text>
					{run() ? widgetLines(run()!).join("\n") : "No active dld run."}
				</text>
			),
		});

		// The board command mounts through the app slot so its keymap layer
		// registers inside the component tree.
		ctx.ui.slot({
			append: "app",
			render: () => <BoardCommand context={ctx} root={root} />,
		});

		return () => dispose();
	},
});
