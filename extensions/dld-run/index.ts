import type { ExecResult, ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatDoctorReport, runDoctor } from "./doctor.ts";
import { LoopController, type LoopContext, type LoopUi } from "./loop.ts";
import { boardLines, statusLine, widgetLines } from "../dld-core/render.ts";
import { parseStartArgs } from "../dld-core/parse-start-args.ts";
import {
	activeRun as apiActiveRun,
	resumableRun as apiResumableRun,
	guardPreconditions as apiGuardPreconditions,
	createRun as apiCreateRun,
	addItem as apiAddItem,
	setRunStatus as apiSetRunStatus,
	appendRunEvent as apiAppendRunEvent,
} from "../dld-core/run-api.ts";
import { activeMinutes, readEventsFrom, readRunFrom } from "../dld-core/run-state.ts";

// @decision(DL-006) @decision(DL-008) @decision(DL-011)
export type DldGoalApi = Pick<
	ExtensionAPI,
	"registerCommand" | "exec" | "appendEntry" | "on" | "sendMessage" | "registerEntryRenderer"
>;

const STATUS_KEY = "dld-run";
const WIDGET_KEY = "dld-run-run";

/** Time between agent_end and the deferred dispatch. Long enough for the
 * session to settle, short enough to feel like a handoff. */
const CONTINUATION_DELAY_MS = 100;

export default function dldGoalExtension(pi: DldGoalApi): void {
	// Adapt pi's exec to the core Exec shape. Pi's exec takes options as the
	// third argument; core passes cwd as a string. The scripts resolve the
	// project root internally, so the cwd parameter is informational here.
	const loop = new LoopController((command: string, args: string[]): Promise<ExecResult> =>
		pi.exec(command, args),
	);

	const uiAdapterFor = (ctx: ExtensionContext): LoopUi => ({
		notify: (message, type) => ctx.ui.notify(message, type),
		card: (lines) => pi.appendEntry("dld-run-card", { lines }),
	});

	// Paint the persistent surfaces from the on-disk state. Called after every
	// event that can change the run; when nothing is active the surfaces clear.
	let projectRootCache: string | null = null;
	const projectRoot = async (ctx: ExtensionContext): Promise<string> => {
		if (projectRootCache) return projectRootCache;
		const result = await pi.exec("git", ["-C", ctx.cwd, "rev-parse", "--show-toplevel"]);
		projectRootCache = result.code === 0 ? result.stdout.trim() : ctx.cwd;
		return projectRootCache;
	};

	const refreshSurfaces = async (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		const root = await projectRoot(ctx);
		const execFn = (command: string, args: string[]): Promise<ExecResult> => pi.exec(command, args);
		const active = await (async () => {
			const result = await apiActiveRun(execFn, root);
			if (!result.ok || !result.value) return null;
			const slug = result.value;
			const read = readRunFrom(`${root}/.dld/runs/${slug}`);
			return read.ok ? { state: read.state, runDir: `${root}/.dld/runs/${slug}` } : null;
		})();
		if (!active) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}
		const minutes = activeMinutes(active.state, readEventsFrom(active.runDir).events);
		ctx.ui.setStatus(STATUS_KEY, statusLine(active.state, minutes));
		ctx.ui.setWidget(WIDGET_KEY, widgetLines(active.state, minutes));
	};
	const contextAdapterFor = (ctx: ExtensionContext): LoopContext => ({
		cwd: ctx.cwd,
		isIdle: () => ctx.isIdle(),
		hasPendingMessages: () => ctx.hasPendingMessages(),
	});

	pi.registerCommand("dld-run-doctor", {
		description: "Check that dld-run can run: bash, jq, skill scripts, and workspace config",
		handler: async (_args, ctx) => {
			const report = await runDoctor(
				(command, commandArgs, options) => pi.exec(command, commandArgs, options),
				ctx.cwd,
			);
			const text = formatDoctorReport(report);

			if (ctx.hasUI) {
				ctx.ui.notify(text, report.ok ? "info" : "warning");
			} else {
				pi.appendEntry("dld-run-doctor", { report, text });
			}
		},
	});

	pi.registerCommand("dld-run", {
		description: "Drive a goal run: start, pause, resume, stop, status, or board",
		handler: async (args, ctx) => {
			await handleGoalCommand(pi, loop, args, ctx, scheduleContinuation, projectRoot);
			await refreshSurfaces(ctx);
		},
	});

	// Cards render in the transcript as custom entries: scrollback, no redraw,
	// and never part of LLM context.
	pi.registerEntryRenderer("dld-run-card", (entry, _options, theme) => {
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
							customType: "dld-run:continuation",
							content:
								"Continue the goal run: work the item named in the last dld-run notification, exactly as the dld-run skill describes.",
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
					ctx.ui.notify(`dld-run continuation failed: ${message}`, "error");
				}
			}
		}, CONTINUATION_DELAY_MS);
	};

	pi.on("agent_end", async (event, ctx) => {
		await refreshSurfaces(ctx);

		// @decision(DL-014)
		// An aborted turn is the user pressing Esc — the standard interrupt.
		// Suspend rather than dispatching again, so Esc actually stops the
		// loop instead of watching it restart itself immediately.
		const messages = (event as { messages?: { role?: string; stopReason?: string }[] }).messages ?? [];
		for (let i = messages.length - 1; i >= 0; i--) {
			const message = messages[i];
			if (message?.role === "assistant" && message.stopReason === "aborted") {
				clearTimer();
				if (!loop.isSuspended()) {
					loop.suspend();
					ctx.ui.notify("Run suspended (interrupted). /dld-run resume to continue.", "info");
				}
				return;
			}
		}

		if (loop.isSuspended() || ctx.hasPendingMessages()) {
			clearTimer();
			return;
		}
		scheduleContinuation(ctx);
	});

	pi.on("session_start", async (_event, ctx) => {
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
				`dld-run completion check failed: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
		}
		await refreshSurfaces(ctx);
	});
}

async function handleGoalCommand(
	pi: DldGoalApi,
	loop: LoopController,
	args: string,
	ctx: ExtensionCommandContext,
	scheduleContinuation: (ctx: ExtensionContext) => void,
	projectRoot: (ctx: ExtensionContext) => Promise<string>,
): Promise<void> {
	const sub = args.trim().split(/\s+/)[0] || "status";
	const workspace = ctx.cwd;
	const exec = (command: string, commandArgs: string[]): Promise<ExecResult> => pi.exec(command, commandArgs);

	const resolveSlug = async (resumable = false): Promise<string | null> => {
		const root = await projectRoot(ctx);
		const active = await apiActiveRun(exec, root);
		if (active.ok && active.value) return active.value;
		if (!resumable) return null;
		const resumableResult = await apiResumableRun(exec, root);
		return resumableResult.ok ? resumableResult.value : null;
	};

	switch (sub) {
		case "start": {
			const existing = await resolveSlug();
			if (existing) {
				ctx.ui.notify(`A run is already active: ${existing}`, "warning");
				return;
			}
			const parsed = parseStartArgs(args.trim().replace(/^start\s*/, "").split(/\s+/).filter(Boolean));
			if (!("slug" in parsed)) {
				ctx.ui.notify(parsed.error, "warning");
				return;
			}
			// Preconditions first: dirty tree, active run, non-proposed decisions,
			// and ID collisions all refuse before anything is created.
			const root = await projectRoot(ctx);
			const guard = await apiGuardPreconditions(exec, root, "start", ["--decisions", parsed.decisionIds.join(",")]);
			if (!guard.ok) {
				ctx.ui.notify(guard.error, "error");
				return;
			}
			const created = await apiCreateRun(exec, root, parsed.slug, parsed.title);
			if (!created.ok) {
				ctx.ui.notify(created.error, "error");
				return;
			}
			for (const id of parsed.decisionIds) {
				const added = await apiAddItem(exec, root, parsed.slug, id);
				if (!added.ok) {
					// Roll back: a half-populated run must not go live.
					await apiSetRunStatus(exec, root, parsed.slug, "blocked");
					ctx.ui.notify(`Run created but item ${id} failed: ${added.error} The run is blocked; add the missing items manually or recreate it.`, "error");
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
			// Resume re-validates preconditions: the tree may have gone dirty,
			// collisions may have appeared, or decisions may have drifted while
			// the run sat idle. DL-004 requires this before resuming.
			if (sub === "resume") {
				const root = await projectRoot(ctx);
				const guard = await apiGuardPreconditions(exec, root, "resume", [slug]);
				if (!guard.ok) {
					ctx.ui.notify(guard.error, "error");
					return;
				}
			}
			const status = sub === "pause" ? "paused" : sub === "resume" ? "active" : "stopped";
			const root = await projectRoot(ctx);
			const result = await apiSetRunStatus(exec, root, slug, status);
			if (result.ok) {
				if (sub === "resume") {
					loop.resume();
					scheduleContinuation(ctx);
				} else {
					loop.suspend();
					// Pausing mid-turn must stop the current work, not just the next
					// dispatch — otherwise the agent finishes what it was doing and
					// the user thinks pause is broken.
					if (sub === "pause") ctx.abort();
				}
				const past = sub === "stop" ? "Stopped" : sub === "pause" ? "Paused" : "Resumed";
				ctx.ui.notify(`${past} run ${slug}.`, "info");
				// Pair the status change with its event so activeMinutes
				// derives correctly (DL-024).
				const eventType = sub === "pause" ? "run-paused" : sub === "resume" ? "run-resumed" : "run-stopped";
				await apiAppendRunEvent(exec, root, slug, eventType);
			} else {
				ctx.ui.notify(result.error, "error");
			}
			return;
		}
		case "status": {
			const slug = await resolveSlug(true);
			if (!slug) {
				ctx.ui.notify("No active run.", "info");
				return;
			}
			const read = readRunFrom(`${await projectRoot(ctx)}/.dld/runs/${slug}`);
			if (!read.ok) {
				ctx.ui.notify(`Could not read run ${slug}: ${read.error.detail}`, "error");
				return;
			}
			ctx.ui.notify(boardLines(read.state).join("\n"), "info");
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
				return {
					render: () => lines.map((line, i) => (i === 0 ? theme.fg("accent", theme.bold(line)) : line)),
					invalidate: () => {},
					handleInput: (data: string) => {
						if (data === "\x1b" || data === "q") done();
					},
					dispose: () => {},
				};
			});
			return;
		}
		default:
			ctx.ui.notify("Usage: /dld-run [status] | start DL-014..DL-022 | start <slug> [title] DL-… | pause|resume|stop [slug] | board", "warning");
	}
}
