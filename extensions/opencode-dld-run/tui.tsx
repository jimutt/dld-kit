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
import { existsSync, readdirSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readRunFrom, type RunState } from "../dld-core/run-state.ts";
import { statusLine, widgetLines, boardLines } from "../dld-core/render.ts";

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

// The most relevant run for the UI: the active one, else the most recent
// paused or blocked run — a paused run is exactly when the user needs the
// status surface. Uses dld-core's validated reader; a corrupt state file
// skips that run rather than aborting the scan.
function readActiveRun(root: string): RunState | undefined {
	const runsDir = join(root, ".dld", "runs");
	if (!existsSync(runsDir)) return undefined;
	let fallback: RunState | undefined;
	for (const slug of readdirSync(runsDir, { withFileTypes: true })) {
		if (!slug.isDirectory()) continue;
		const read = readRunFrom(join(runsDir, slug.name));
		if (!read.ok) continue;
		if (read.state.status === "active") return read.state;
		if (!fallback && (read.state.status === "paused" || read.state.status === "blocked")) {
			fallback = read.state;
		}
	}
	return fallback;
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
					const text = boardLines(state).join("\n");
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
