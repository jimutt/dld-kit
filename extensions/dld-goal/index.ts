import type { ExecOptions, ExecResult, ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatDoctorReport, runDoctor } from "./doctor.ts";
import { LoopController, type LoopContext, type LoopUi } from "./loop.ts";
import { scriptPath } from "./paths.ts";

// @decision(DL-006) @decision(DL-008)
export type DldGoalApi = Pick<
	ExtensionAPI,
	"registerCommand" | "exec" | "appendEntry" | "on" | "sendUserMessage"
>;

export default function dldGoalExtension(pi: DldGoalApi): void {
	const loop = new LoopController((command: string, args: string[], options?: ExecOptions): Promise<ExecResult> =>
		pi.exec(command, args, options),
	);

	const uiAdapterFor = (ctx: ExtensionContext): LoopUi => ({
		notify: (message, type) => ctx.ui.notify(message, type),
	});
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
		description: "Drive a goal run: start, pause, resume, stop, or status",
		handler: async (args, ctx) => {
			await handleGoalCommand(pi, loop, args, ctx);
		},
	});

	// Event handlers must never throw: a broken continuation path would spam
	// an error on every turn for the rest of the session. Fail closed — the
	// worst outcome is that continuation stops, not that the session is flooded.
	pi.on("agent_end", async (_event, ctx) => {
		try {
			const dispatched = await loop.onAgentEnd(loop.currentToken(), contextAdapterFor(ctx), uiAdapterFor(ctx));
			if (dispatched) {
				pi.sendUserMessage("Continue the run: work the noted item exactly as the skill describes.", {
					deliverAs: "followUp",
				});
			}
		} catch (error) {
			ctx.ui.notify(
				`dld-goal continuation failed: ${error instanceof Error ? error.message : String(error)}`,
				"error",
			);
		}
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
	});
}

async function handleGoalCommand(pi: DldGoalApi, loop: LoopController, args: string, ctx: ExtensionCommandContext): Promise<void> {
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
			const slug = await resolveSlug();
			if (slug) {
				ctx.ui.notify(`A run is already active: ${slug}`, "warning");
				return;
			}
			const rest = args.trim().split(/\s+/).slice(1);
			const created = await runScript("create-run.sh", [
				"--slug",
				rest[0] ?? "run",
				"--title",
				rest.slice(1).join(" ") || (rest[0] ?? "run"),
			]);
			if (!created.ok) {
				ctx.ui.notify(created.output, "error");
				return;
			}
			loop.invalidate();
			ctx.ui.notify(`Created and activated run: ${created.output}`, "info");
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
				loop.invalidate();
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
		default:
			ctx.ui.notify("Usage: /dld-goal [status] | start <slug> [title] | pause|resume|stop [slug]", "warning");
	}
}
