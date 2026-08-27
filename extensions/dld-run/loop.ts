import { join } from "node:path";
import type { Exec } from "../dld-core/run-api.ts";
import {
	activeRun as apiActiveRun,
	nextItem as apiNextItem,
	pauseRun as apiPauseRun,
	completeRun as apiCompleteRun,
	setItemStatus as apiSetItemStatus,
	verifyItem as apiVerifyItem,
	repinItem as apiRepinItem,
	blockItem as apiBlockItem,
	appendRunEvent as apiAppendRunEvent,
} from "../dld-core/run-api.ts";
import { activeMinutes, readEventsFrom, readRunFrom, type RunState } from "../dld-core/run-state.ts";

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
	/** Append a transcript card for an item outcome. Optional so non-card
	 * contexts (tests, print mode) can ignore it. */
	card?(lines: string[]): void;
}

export interface LoopContext {
	cwd: string;
	isIdle(): boolean;
	hasPendingMessages(): boolean;
}

interface ActiveRun {
	slug: string;
	state: RunState;
	runDir: string;
}

export class LoopController {
	private token = 0;
	/** User input suspends continuation until an explicit resume. */
	private suspended = false;
	/** Items already told that they are waiting on review, so turn_end does not
	 * repeat the warning on every turn while the item stays verifying. */
	private reviewNagged = new Set<number>();
	/** Evidence count at the last verification per item, so verify-item.sh
	 * (which runs the project test suite) only re-runs when new evidence
	 * arrived, not on every turn the item sits in verifying. */
	private verifiedAtEvidence = new Map<number, number>();

	private exec: Exec;

	constructor(exec: Exec) {
		this.exec = exec;
	}

	suspend(): void {
		this.suspended = true;
		this.invalidate();
	}

	resume(): void {
		this.suspended = false;
		this.invalidate();
	}

	isSuspended(): boolean {
		return this.suspended;
	}

	/** Mint a new token. Every queued continuation carrying an older token is void. */
	invalidate(): number {
		this.token += 1;
		this.reviewNagged.clear();
		return this.token;
	}

	currentToken(): number {
		return this.token;
	}

	private projectRootCache = new Map<string, string>();

	/** The scripts resolve .dld/ from the git root; the extension must match
	 * or a session started in a subdirectory sees a different filesystem. */
	private async projectRoot(ctx: LoopContext): Promise<string> {
		const cached = this.projectRootCache.get(ctx.cwd);
		if (cached) return cached;
		const result = await this.exec("git", ["-C", ctx.cwd, "rev-parse", "--show-toplevel"], ctx.cwd);
		const root = result.code === 0 ? result.stdout.trim() : ctx.cwd;
		this.projectRootCache.set(ctx.cwd, root);
		return root;
	}

	/** Active run from a context, or null. Active slug resolution goes through run-state.sh. */
	private async activeRun(ctx: LoopContext): Promise<ActiveRun | null> {
		const root = await this.projectRoot(ctx);
		const active = await apiActiveRun(this.exec, root);
		if (!active.ok || !active.value) return null;
		const slug = active.value;
		const runDir = join(root, ".dld", "runs", slug);
		const read = readRunFrom(runDir);
		if (!read.ok) return null;
		return { slug, state: read.state, runDir };
	}

	/**
	 * Decide whether a continuation is dispatched at agent_end. The token has
	 * to be current before anything else is considered.
	 */
	async onAgentEnd(capturedToken: number, ctx: LoopContext, ui: LoopUi): Promise<boolean> {
		// The token is captured by the caller at schedule time and checked
		// again after the awaited script calls, just before dispatch — a pause
		// or stop landing mid-flight voids it. The on-disk status check is the
		// primary anti-stale guard; this catches the in-flight race.
		if (!ctx.isIdle() || ctx.hasPendingMessages()) return false;

		const active = await this.activeRun(ctx);
		if (!active) return false;
		if (active.state.status !== "active") return false;

		if (!this.withinBounds(active.state, active.runDir)) {
			await this.pauseAtBounds(active, ctx, ui);
			return false;
		}

		const root = await this.projectRoot(ctx);
		const next = await apiNextItem(this.exec, root, active.slug);
		if (next.kind === "blocked") {
			await this.pauseRun(active.slug, ctx, ui, next.reason);
			return false;
		}
		if (next.kind === "error") {
			ui.notify(next.error, "error");
			return false;
		}
		if (next.kind === "complete") {
			await this.completeRun(active.slug, ctx, ui);
			return false;
		}
		const index = next.index;

		const item = active.state.items.find((entry) => entry.index === index);
		if (!item) {
			ui.notify(`next-item returned item ${index}, but it is not in state`, "error");
			return false;
		}

		// A pause (or stop, or a new run) that landed while the scripts above
		// were running voids this dispatch. The on-disk status check caught the
		// race at the start; this catches the race at the end.
		if (capturedToken !== this.token) return false;

		// Claim the item before dispatching so the next agent_end sees it as
		// in-flight rather than re-dispatching the same work. next-item.sh
		// prefers in-flight items, so claiming makes the loop single-threaded.
		const claimed = await apiSetItemStatus(this.exec, root, active.slug, item.index, "implementing");
		if (!claimed.ok) {
			ui.notify(`Could not claim item ${item.index}: ${claimed.error}`, "error");
			return false;
		}

		const decisions = item.decisions.map((d) => d.id).join(", ");
		ui.notify(`Continue goal run '${active.slug}'. Work item ${index} (${decisions}).`, "info");
		return true;
	}

	private async completeRun(slug: string, ctx: LoopContext, ui: LoopUi): Promise<void> {
		const root = await this.projectRoot(ctx);
		const result = await apiCompleteRun(this.exec, root, slug);
		if (!result.ok) {
			ui.notify(`Could not complete run ${slug}: ${result.error}`, "error");
			return;
		}
		this.invalidate();
		ui.notify(`Run ${slug} complete — every item is accepted or skipped.`, "info");
	}

	private async pauseRun(slug: string, ctx: LoopContext, ui: LoopUi, reason: string): Promise<void> {
		// A blocked item keeps its blocked status — pausing must not collapse
		// the distinction the contract's transition table makes.
		const root = await this.projectRoot(ctx);
		const result = await apiPauseRun(this.exec, root, slug, reason || undefined);
		if (result.ok) this.invalidate();
		ui.notify(reason || `Run ${slug} paused.`, "warning");
	}

	private withinBounds(state: RunState, runDir: string): boolean {
		const accepted = state.items.filter((item) => item.status === "accepted" || item.status === "skipped").length;
		if (state.bounds.maxItems > 0 && accepted >= state.bounds.maxItems) return false;
		if (state.bounds.maxMinutes > 0) {
			// The bound measures active time: pauses, overnight gaps, and idle
			// sessions do not count toward it.
			const elapsedMin = activeMinutes(state, readEventsFrom(runDir).events);
			if (elapsedMin >= state.bounds.maxMinutes) return false;
		}
		return true;
	}

	private async pauseAtBounds(active: ActiveRun, ctx: LoopContext, ui: LoopUi): Promise<void> {
		const root = await this.projectRoot(ctx);
		const result = await apiPauseRun(this.exec, root, active.slug, "bounds reached");
		if (!result.ok) {
			ui.notify(`Could not pause run ${active.slug}: ${result.error}`, "error");
			return;
		}
		this.invalidate();
		ui.notify(`Run ${active.slug} reached its bounds and paused. Raise the limit and resume to keep going.`, "warning");
	}

	/**
	 * Advance an item through verification and completion. Delegate every write.
	 */
	async onTurnEnd(ctx: LoopContext, ui: LoopUi): Promise<void> {
		// Suspension covers the write path too: a suspended loop mutates nothing.
		if (this.suspended) return;
		const active = await this.activeRun(ctx);
		if (!active) return;
		if (active.state.status !== "active") return;

		const item = active.state.items.find(
			(entry) =>
				entry.status === "verifying" &&
				entry.evidence.length > 0 &&
				entry.evidence.length !== this.verifiedAtEvidence.get(entry.index),
		);
		if (!item) return;

		this.verifiedAtEvidence.set(item.index, item.evidence.length);
		const root = await this.projectRoot(ctx);
		const verify = await apiVerifyItem(this.exec, root, active.slug, item.index);

		if (verify.kind === "infrastructure") {
			// A timeout or spawn failure is not a test failure — surface and
			// leave the item verifying so the next turn retries.
			ui.notify(`Item ${item.index} verification could not run: ${verify.error}`, "warning");
			return;
		}

		if (verify.kind === "pass") {
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
			const accepted = await apiSetItemStatus(this.exec, root, active.slug, item.index, "accepted");
			if (!accepted.ok) {
				ui.notify(`Could not mark item ${item.index} accepted: ${accepted.error}`, "error");
				return;
			}
			const repinned = await apiRepinItem(this.exec, root, active.slug, item.index);
			if (!repinned.ok) {
				ui.notify(`Could not repin item ${item.index}: ${repinned.error}`, "error");
				return;
			}
			const eventAppended = await apiAppendRunEvent(this.exec, root, active.slug, "item-accepted", { index: item.index });
			if (!eventAppended.ok) {
				ui.notify(`Could not record item ${item.index} acceptance: ${eventAppended.error}`, "error");
				return;
			}
			ui.notify(`Item ${item.index} accepted (verification passed, review disabled).`, "info");
			ui.card?.([
				`✔ item ${item.index} accepted · ${item.decisions.map((d) => d.id).join(", ")}`,
				...item.evidence.slice(0, 4).map((e) => `  ${typeof e === "string" ? e : JSON.stringify(e)}`),
			]);
			return;
		}

		// attempts counts completed attempts. The skill claims with bump-attempt
		// (0→1) so a first failure sees attempts=1 and retries; a second failure
		// sees attempts=2 and blocks. Do not bump here — the next claim does it.
		if (item.attempts < 2) {
			const retried = await apiSetItemStatus(this.exec, root, active.slug, item.index, "implementing");
			if (!retried.ok) {
				ui.notify(`Could not send item ${item.index} back for a retry: ${retried.error}`, "error");
				return;
			}
			ui.notify(`Item ${item.index} verification failed; retrying (attempt ${item.attempts + 1}).`, "warning");
			return;
		}

		const blocker = await apiBlockItem(this.exec, root, active.slug, item.index, verify.output);
		if (!blocker.ok) {
			ui.notify(blocker.error, "error");
			return;
		}
		ui.notify(`Item ${item.index} blocked: ${verify.output}`, "warning");
	}
}
