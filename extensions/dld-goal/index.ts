import type { ExecOptions, ExecResult, ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatDoctorReport, runDoctor } from "./doctor.ts";
import { LoopController, type LoopContext, type LoopUi } from "./loop.ts";
import { scriptPath } from "./paths.ts";
import { boardLines, statusLine, widgetLines } from "./render.ts";
import { readRunFrom } from "./run-state.ts";

// @decision(DL-006) @decision(DL-008) @decision(DL-011)
export type DldGoalApi = Pick<
	ExtensionAPI,
	"registerCommand" | "exec" | "appendEntry" | "on" | "sendMessage" | "registerEntryRenderer"
>;

const STATUS_KEY = "dld-goal";
const WIDGET_KEY = "dld-goal-run";

/** Time between agent_end and the deferred dispatch. Long enough for the
 * session to settle, short enough to feel like a handoff. */
const CONTINUATION_DELAY_MS = 100;

export default function dldGoalExtension(pi: DldGoalApi): void {
	const loop = new LoopController((command: string, args: string[], options?: ExecOptions): Promise<ExecResult> =>
		pi.exec(command, args, options),
	);

	const uiAdapterFor = (ctx: ExtensionContext): LoopUi => ({
		notify: (message, type) => ctx.ui.notify(message, type),
		card: (lines) => pi.appendEntry("dld-goal-card", { lines }),
	});

	// Paint the persistent surfaces from the on-disk state. Called after every
	// event that can change the run; when nothing is active the surfaces clear.
	const refreshSurfaces = async (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		const active = await (async () => {
			const result = await pi.exec("bash", [scriptPath("run-state.sh"), "active"]);
			if (result.code !== 0 || !result.stdout.trim()) return null;
			const slug = result.stdout.trim();
			const read = readRunFrom(`${ctx.cwd}/.dld/runs/${slug}`);
			return read.ok ? read.state : null;
		})();
		if (!active) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}
		ctx.ui.setStatus(STATUS_KEY, statusLine(active));
		ctx.ui.setWidget(WIDGET_KEY, widgetLines(active));
	};
	const contextAdapterFor = (ctx: ExtensionContext): LoopContext => ({
		cwd: ctx.cwd,
		isIdle: () => ctx.isIdle(),
		hasPendingMessages: () => ctx.hasPendingMessages(),
	});

	pi.registerCommand("dld-goal-doctor", {
		description: "Check that dld-goal can run: bash, jq, skill scripts, and workspace config",
		handler: async (_args, ctx) => {
			const report = await runDoctor(
				(command, commandArgs, options) => pi.exec(command, commandArgs, options),
				ctx.cwd,
			);
			const text = formatDoctorReport(report);

			if (ctx.hasUI) {
				ctx.ui.notify(text, report.ok ? "info" : "warning");
			} else {
				pi.appendEntry("dld-goal-doctor", { report, text });
			}
		},
	});

	pi.registerCommand("dld-goal", {
		description: "Drive a goal run: start, pause, resume, stop, status, or board",
		handler: async (args, ctx) => {
			await handleGoalCommand(pi, loop, args, ctx, scheduleContinuation);
			await refreshSurfaces(ctx);
		},
	});

	// Cards render in the transcript as custom entries: scrollback, no redraw,
	// and never part of LLM context.
	pi.registerEntryRenderer("dld-goal-card", (entry, _options, theme) => {
		const data = entry.data as { lines?: string[] } | undefined;
		const text = (data?.lines ?? []).join("\n");
		return {
			render: () => [theme.fg("accent", text)],
			invalidate: () => {},
		};
	});

	// Event handlers must never throw: a broken continuation path would spam
	// an error on every turn for the rest of the session. Fail closed — the
	// worst outcome is that continuation stops, not that the session is flooded.
	// Continuation is scheduled, never awaited inside the handler. pi
	// invalidates the extension runtime when the session tears down (print
	// and RPC modes), and a handler still awaiting script calls at that
	// point dies with a stale-ctx error. The timer lets the handler return
	// immediately; the deferred callback re-checks the gates and dispatches
	// through pi's message queue. Pattern follows pi-goal-pro.
	let continuationTimer: ReturnType<typeof setTimeout> | null = null;
	const clearTimer = () => {
		if (continuationTimer) {
			clearTimeout(continuationTimer);
			continuationTimer = null;
		}
	};

	// @decision(DL-013)
	const scheduleContinuation = (ctx: ExtensionContext) => {
		clearTimer();
		continuationTimer = setTimeout(async () => {
			continuationTimer = null;
			try {
				if (loop.isSuspended() || ctx.hasPendingMessages()) return;
				const dispatched = await loop.onAgentEnd(loop.currentToken(), contextAdapterFor(ctx), uiAdapterFor(ctx));
				if (dispatched) {
					pi.sendMessage(
						{
							customType: "dld-goal:continuation",
							content:
								"Continue the goal run: work the item named in the last dld-goal notification, exactly as the dld-goal skill describes.",
							display: false,
						},
						{ triggerTurn: true, deliverAs: "followUp" },
					);
				}
			} catch (error) {
				// A stale runtime during session teardown is expected; surface
				// anything else once.
				const message = error instanceof Error ? error.message : String(error);
				if (!message.includes("stale")) {
					ctx.ui.notify(`dld-goal continuation failed: ${message}`, "error");
				}
			}
		}, CONTINUATION_DELAY_MS);
	};

	pi.on("agent_end", async (_event, ctx) => {
		await refreshSurfaces(ctx);
		if (loop.isSuspended() || ctx.hasPendingMessages()) {
			clearTimer();
			return;
		}
		scheduleContinuation(ctx);
	});

	pi.on("session_start", async (_event, ctx) => {
		await refreshSurfaces(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		await refreshSurfaces(ctx);
	});

	// Any user input suspends continuation until the user resumes. This is
	// what keeps a loop from dispatching over a user who is mid-sentence.
	pi.on("input", () => {
		clearTimer();
		loop.suspend();
	});

	pi.on("session_shutdown", () => {
		clearTimer();
	});

	pi.on("turn_end", async (_event, ctx) => {
		try {
			await loop.onTurnEnd(contextAdapterFor(ctx), uiAdapterFor(ctx));
		} catch (error) {
			ctx.ui.notify(
				`dld-goal completion check failed: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
		}
		await refreshSurfaces(ctx);
	});
}

interface StartArgs {
	slug: string;
	title: string;
	decisionIds: string[];
}

/**
 * Parse the tolerant start syntax. The agent is the parser: ranges expand,
 * slug and title are derived when not given.
 *
 *   /dld-goal start DL-014..DL-022          → slug dl-014-022, 9 items
 *   /dld-goal start DL-014 - DL-022         → same
 *   /dld-goal start my-batch DL-014 DL-015  → slug my-batch, 2 items
 *   /dld-goal start my-batch "My title" --decisions DL-014,DL-015
 */
function parseStartArgs(raw: string): StartArgs | { error: string } {
	const rest = raw.split(/\s+/).slice(1).filter(Boolean);
	if (rest.length === 0) {
		return { error: "Usage: /dld-goal start <DL-NNN..DL-NNN | slug [title] decisions…>" };
	}

	// Range form: DL-014..DL-022 or DL-014 - DL-022 (spaces tolerated).
	const joined = rest.join(" ");
	const rangeMatch = joined.match(/^(DL-\d+)\s*(?:\.\.|-|–|—|to)\s*(DL-\d+)$/i);
	if (rangeMatch) {
		const from = Number(rangeMatch[1]!.slice(3));
		const to = Number(rangeMatch[2]!.slice(3));
		if (!Number.isInteger(from) || !Number.isInteger(to) || from > to || to - from > 50) {
			return { error: `Invalid range: ${rangeMatch[1]}..${rangeMatch[2]}` };
		}
		const ids = Array.from({ length: to - from + 1 }, (_, i) => `DL-${String(from + i).padStart(3, "0")}`);
		return {
			slug: `dl-${from}-${to}`,
			title: `${rangeMatch[1]} through ${rangeMatch[2]}`,
			decisionIds: ids,
		};
	}

	// Flag form: --decisions DL-A,DL-B
	const decisionFlag = rest.indexOf("--decisions");
	let decisionIds: string[] = [];
	let titleParts: string[] = [];
	if (decisionFlag >= 0) {
		decisionIds = (rest[decisionFlag + 1] ?? "").split(",").filter(Boolean);
		titleParts = rest.slice(1, decisionFlag);
	} else {
		const positional = rest.slice(1);
		decisionIds = positional.filter((p) => /^DL-\d+$/.test(p));
		titleParts = positional.filter((p) => !/^DL-\d+$/.test(p));
	}

	if (decisionIds.length === 0) {
		return { error: "A run needs decisions. Try /dld-goal start DL-014..DL-022 or /dld-goal start my-batch DL-014 DL-015" };
	}

	// First token is the slug if it isn't a decision ID; otherwise derive one.
	const firstIsDecision = /^DL-\d+$/.test(rest[0] ?? "");
	const slug = firstIsDecision ? `dl-${decisionIds[0]!.slice(3)}-${decisionIds[decisionIds.length - 1]!.slice(3)}` : (rest[0] ?? "run");
	const title = titleParts.join(" ") || (firstIsDecision ? `${decisionIds[0]} batch` : slug);

	return { slug, title, decisionIds };
}

async function handleGoalCommand(
	pi: DldGoalApi,
	loop: LoopController,
	args: string,
	ctx: ExtensionCommandContext,
	scheduleContinuation: (ctx: ExtensionContext) => void,
): Promise<void> {
	const sub = args.trim().split(/\s+/)[0] || "status";
	const workspace = ctx.cwd;
	const exec = (command: string, commandArgs: string[], options?: ExecOptions) => pi.exec(command, commandArgs, options);
	const runScript = async (name: string, scriptArgs: string[]) => {
		const result = await exec("bash", [scriptPath(name), ...scriptArgs]);
		const output = result.stdout.length > 0 ? result.stdout.trimEnd() : result.stderr.trimEnd();
		return { ok: result.code === 0, code: result.code, output };
	};

	const resolveSlug = async (resumable = false): Promise<string | null> => {
		const active = await runScript("run-state.sh", ["active"]);
		if (active.ok && active.output) return active.output.trim();
		if (!resumable) return null;
		// A paused or blocked run has no active entry; resume and status have to
		// find it by listing rather than asking for the active one.
		const list = await runScript("run-state.sh", ["list"]);
		if (!list.ok) return null;
		const lines = list.output.split("\n").filter((l) => /\s(paused|blocked)$/.test(l));
		const last = lines[lines.length - 1];
		return last ? (last.split(/\s+/)[0] ?? null) : null;
	};

	switch (sub) {
		case "start": {
			const existing = await resolveSlug();
			if (existing) {
				ctx.ui.notify(`A run is already active: ${existing}`, "warning");
				return;
			}
			const parsed = parseStartArgs(args.trim());
			if (!("slug" in parsed)) {
				ctx.ui.notify(parsed.error, "warning");
				return;
			}
			// Preconditions first: dirty tree, active run, non-proposed decisions,
			// and ID collisions all refuse before anything is created.
			const guard = await runScript("guard-preconditions.sh", ["start", "--decisions", parsed.decisionIds.join(",")]);
			if (!guard.ok) {
				ctx.ui.notify(guard.output, "error");
				return;
			}
			const created = await runScript("create-run.sh", ["--slug", parsed.slug, "--title", parsed.title]);
			if (!created.ok) {
				ctx.ui.notify(created.output, "error");
				return;
			}
			for (const id of parsed.decisionIds) {
				const added = await runScript("run-state.sh", ["add-item", parsed.slug, "--decisions", id]);
				if (!added.ok) {
					ctx.ui.notify(`Run created but item ${id} failed: ${added.output}`, "error");
					return;
				}
			}
			loop.resume();
			ctx.ui.notify(`Started run ${parsed.slug} · ${parsed.decisionIds.length} item${parsed.decisionIds.length === 1 ? "" : "s"} · ${parsed.title}`, "info");
			scheduleContinuation(ctx);
			return;
		}
		case "pause":
		case "resume":
		case "stop": {
			const explicit = args.trim().split(/\s+/)[1];
			const slug = explicit ?? (await resolveSlug(sub === "resume"));
			if (!slug) {
				ctx.ui.notify(`No ${sub === "resume" ? "resumable" : "active"} run to ${sub}.`, "warning");
				return;
			}
			const status = sub === "pause" ? "paused" : sub === "resume" ? "active" : "stopped";
			const result = await runScript("run-state.sh", ["set-status", slug, status]);
			if (result.ok) {
				if (sub === "resume") {
					loop.resume();
					scheduleContinuation(ctx);
				} else {
					loop.invalidate();
				}
				const past = sub === "stop" ? "Stopped" : sub === "pause" ? "Paused" : "Resumed";
				ctx.ui.notify(`${past} run ${slug}.`, "info");
			} else {
				ctx.ui.notify(result.output, "error");
			}
			return;
		}
		case "status": {
			const slug = await resolveSlug(true);
			if (!slug) {
				ctx.ui.notify("No active run.", "info");
				return;
			}
			const result = await runScript("run-state.sh", ["get", slug]);
			ctx.ui.notify(result.output, result.ok ? "info" : "warning");
			return;
		}
		case "board": {
			const slug = await resolveSlug(true);
			if (!slug) {
				ctx.ui.notify("No run to show.", "info");
				return;
			}
			const read = readRunFrom(`${workspace}/.dld/runs/${slug}`);
			if (!read.ok) {
				ctx.ui.notify(`Could not read run ${slug}: ${read.error.detail}`, "error");
				return;
			}
			if (!ctx.hasUI) {
				ctx.ui.notify(boardLines(read.state).join("\n"), "info");
				return;
			}
			await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
				const lines = boardLines(read.state);
				let disposed = false;
				return {
					render: () => lines.map((line, i) => (i === 0 ? theme.fg("accent", theme.bold(line)) : line)),
					invalidate: () => {},
					handleInput: (data: string) => {
						if (data === "\x1b" || data === "q") {
							disposed = true;
							done();
						}
					},
					dispose: () => {
						disposed = true;
					},
				};
			});
			return;
		}
		default:
			ctx.ui.notify("Usage: /dld-goal [status] | start DL-014..DL-022 | start <slug> [title] DL-… | pause|resume|stop [slug] | board", "warning");
	}
}
