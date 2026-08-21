import { join } from "node:path";
import { scriptPath } from "./paths.ts";
import type { ExecLike } from "./run-state.ts";
import { readRunFrom, type RunState } from "./run-state.ts";

// @decision(DL-008) @decision(DL-004)
// In-session continuation: agent_end advances an active run when everything
// about it is safe. The gates are ordered from cheapest revocation (run token,
// user activity) to most expensive (shelling out to next-item). Only when all
// clear do we dispatch a continuation signal; the actual sendUserMessage call
// stays with the extension entry point because triggering a turn is a
// lifecycle action, not a state read.
//
// Autonomous advancement of an item past `verifying` is done by completing
// the four-part transaction on turn_end, once the item has actually collected
// acceptance evidence. The transaction delegates every write (DL-007) and
// only completes when the mechanical gates pass.

export interface LoopUi {
	notify(message: string, type?: "info" | "warning" | "error"): void;
}

export interface LoopContext {
	cwd: string;
	isIdle(): boolean;
	hasPendingMessages(): boolean;
}

interface MutationEnvelope {
	ok: boolean;
	code: number;
	output: string;
}

interface ActiveRun {
	slug: string;
	state: RunState;
	runDir: string;
}

export class LoopController {
	private token = 0;
	/** Items already told that they are waiting on review, so turn_end does not
	 * repeat the warning on every turn while the item stays verifying. */
	private reviewNagged = new Set<number>();

	constructor(private exec: ExecLike) {}

	/** Mint a new token. Every queued continuation carrying an older token is void. */
	invalidate(): number {
		this.token += 1;
		return this.token;
	}

	currentToken(): number {
		return this.token;
	}

	private async runScript(cwd: string, name: string, args: string[]): Promise<MutationEnvelope> {
		const result = await this.exec("bash", [scriptPath(name), ...args]);
		const output = result.stdout.length > 0 ? result.stdout.trimEnd() : result.stderr.trimEnd();
		return { ok: result.code === 0, code: result.code, output };
	}

	private contextCwd(ctx: LoopContext): string {
		return ctx.cwd;
	}

	/** Active run from a context, or null. Active slug resolution goes through run-state.sh. */
	private async activeRun(ctx: LoopContext): Promise<ActiveRun | null> {
		const active = await this.runScript(this.contextCwd(ctx), "run-state.sh", ["active"]);
		if (!active.ok) return null;
		const slug = active.output.trim();
		if (!slug) return null;
		const runDir = join(this.contextCwd(ctx), ".dld", "runs", slug);
		const read = readRunFrom(runDir);
		if (!read.ok) return null;
		return { slug, state: read.state, runDir };
	}

	/**
	 * Decide whether a continuation is dispatched at agent_end. The token has
	 * to be current before anything else is considered.
	 */
	async onAgentEnd(capturedToken: number, ctx: LoopContext, ui: LoopUi): Promise<boolean> {
		if (capturedToken !== this.token) return false;
		if (!ctx.isIdle() || ctx.hasPendingMessages()) return false;

		const active = await this.activeRun(ctx);
		if (!active) return false;
		if (active.state.status !== "active") return false;

		if (!this.withinBounds(active.state)) {
			await this.pauseAtBounds(active, ctx, ui);
			return false;
		}

		const next = await this.runScript(this.contextCwd(ctx), "next-item.sh", [active.slug]);
		if (!next.ok) {
			if (next.code === 2) {
				await this.pauseRun(active.slug, ctx, ui, next.output);
				return false;
			}
			ui.notify(next.output, "error");
			return false;
		}

		// Exit 0 with empty output means every item is accepted or skipped: the
		// run is complete, not broken.
		if (next.output.trim() === "") {
			await this.completeRun(active.slug, ctx, ui);
			return false;
		}

		const index = Number(next.output.trim());
		if (!Number.isInteger(index) || index < 1) {
			ui.notify(`next-item returned an unexpected index: ${next.output.trim()}`, "error");
			return false;
		}

		const item = active.state.items.find((entry) => entry.index === index);
		if (!item) {
			ui.notify(`next-item returned item ${index}, but it is not in state`, "error");
			return false;
		}

		// A pause (or stop, or a new run) that landed while the scripts above
		// were running voids this dispatch. The on-disk status check caught the
		// race at the start; this catches the race at the end.
		if (capturedToken !== this.token) return false;

		const decisions = item.decisions.map((d) => d.id).join(", ");
		ui.notify(`Continue goal run '${active.slug}'. Work item ${index} (${decisions}).`, "info");
		return true;
	}

	private async completeRun(slug: string, ctx: LoopContext, ui: LoopUi): Promise<void> {
		const result = await this.runScript(this.contextCwd(ctx), "run-state.sh", ["set-status", slug, "complete"]);
		if (!result.ok) {
			ui.notify(`Could not complete run ${slug}: ${result.output}`, "error");
			return;
		}
		this.invalidate();
		await this.runScript(this.contextCwd(ctx), "append-event.sh", [slug, "run-completed"]);
		ui.notify(`Run ${slug} complete — every item is accepted or skipped.`, "info");
	}

	private async pauseRun(slug: string, ctx: LoopContext, ui: LoopUi, reason: string): Promise<void> {
		const result = await this.runScript(this.contextCwd(ctx), "run-state.sh", ["set-status", slug, "paused"]);
		if (result.ok) this.invalidate();
		ui.notify(reason || `Run ${slug} paused.`, "warning");
	}

	private withinBounds(state: RunState): boolean {
		const accepted = state.items.filter((item) => item.status === "accepted" || item.status === "skipped").length;
		if (state.bounds.maxItems > 0 && accepted >= state.bounds.maxItems) return false;
		if (state.bounds.maxMinutes > 0) {
			// The contract's cap is wall-clock, so idle time between turns counts.
			const elapsedMin = (Date.now() - Date.parse(state.createdAt)) / 60000;
			if (elapsedMin >= state.bounds.maxMinutes) return false;
		}
		return true;
	}

	private async pauseAtBounds(active: ActiveRun, ctx: LoopContext, ui: LoopUi): Promise<void> {
		const result = await this.runScript(this.contextCwd(ctx), "run-state.sh", ["set-status", active.slug, "paused"]);
		if (!result.ok) {
			ui.notify(`Could not pause run ${active.slug}: ${result.output}`, "error");
			return;
		}
		this.invalidate();
		ui.notify(`Run ${active.slug} reached its bounds and paused. Raise the limit and resume to keep going.`, "warning");
	}

	/**
	 * Advance an item through verification and completion. Delegate every write.
	 */
	async onTurnEnd(ctx: LoopContext, ui: LoopUi): Promise<void> {
		const active = await this.activeRun(ctx);
		if (!active) return;
		if (active.state.status !== "active") return;

		const item = active.state.items.find((entry) => entry.status === "verifying" && entry.evidence.length > 0);
		if (!item) return;

		const verify = await this.runScript(this.contextCwd(ctx), "verify-item.sh", [active.slug, String(item.index)]);

		if (verify.code === 0) {
			if (active.state.review === "enabled") {
				// The review step is a judgment call the loop cannot make. The item
				// stays verifying and the agent is told to run the review before the
				// item can be accepted. Nag once per item, not every turn.
				if (!this.reviewNagged.has(item.index)) {
					this.reviewNagged.add(item.index);
					ui.notify(
						`Item ${item.index} passed mechanical checks but review is enabled — run the review subagent, then the item can be accepted.`,
						"warning",
					);
				}
				return;
			}
			const accepted = await this.runScript(this.contextCwd(ctx), "run-state.sh", [
				"set-item-status",
				active.slug,
				String(item.index),
				"accepted",
			]);
			if (!accepted.ok) {
				ui.notify(`Could not mark item ${item.index} accepted: ${accepted.output}`, "error");
				return;
			}
			const repinned = await this.runScript(this.contextCwd(ctx), "run-state.sh", ["repin-item", active.slug, String(item.index)]);
			if (!repinned.ok) {
				ui.notify(`Could not repin item ${item.index}: ${repinned.output}`, "error");
				return;
			}
			const eventAppended = await this.runScript(this.contextCwd(ctx), "append-event.sh", [
				active.slug,
				"item-accepted",
				"--data",
				JSON.stringify({ index: item.index }),
			]);
			if (!eventAppended.ok) {
				ui.notify(`Could not record item ${item.index} acceptance: ${eventAppended.output}`, "error");
				return;
			}
			ui.notify(`Item ${item.index} accepted (verification passed, review disabled).`, "info");
			return;
		}

		const bump = await this.runScript(this.contextCwd(ctx), "run-state.sh", ["bump-attempt", active.slug, String(item.index)]);
		const attempts = Number(bump.output.trim());
		if (!Number.isFinite(attempts)) {
			ui.notify(`bump-attempt returned an unexpected output: ${bump.output}`, "error");
			return;
		}

		if (attempts < 2) {
			const retried = await this.runScript(this.contextCwd(ctx), "run-state.sh", [
				"set-item-status",
				active.slug,
				String(item.index),
				"implementing",
			]);
			if (!retried.ok) {
				ui.notify(`Could not send item ${item.index} back for a retry: ${retried.output}`, "error");
				return;
			}
			ui.notify(`Item ${item.index} verification failed; retrying (attempt ${attempts}).`, "warning");
			return;
		}

		const blocker = await this.runScript(this.contextCwd(ctx), "block-item.sh", [
			active.slug,
			String(item.index),
			"--reason",
			verify.output,
			"--force",
		]);
		if (!blocker.ok) {
			ui.notify(blocker.output, "error");
			return;
		}
		ui.notify(blocker.output, "warning");
	}
}
