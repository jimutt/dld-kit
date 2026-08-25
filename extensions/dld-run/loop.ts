import { join } from "node:path";
import { scriptPath } from "./paths.ts";
import type { ExecLike } from "./run-state.ts";
import { activeMinutes, readEventsFrom, readRunFrom, type RunState } from "./run-state.ts";

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
	/** User input suspends continuation until an explicit resume. */
	private suspended = false;
	/** Items already told that they are waiting on review, so turn_end does not
	 * repeat the warning on every turn while the item stays verifying. */
	private reviewNagged = new Set<number>();
	/** Evidence count at the last verification per item, so verify-item.sh
	 * (which runs the project test suite) only re-runs when new evidence
	 * arrived, not on every turn the item sits in verifying. */
	private verifiedAtEvidence = new Map<number, number>();

	constructor(private exec: ExecLike) {}

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

	private async runScript(name: string, args: string[]): Promise<MutationEnvelope> {
		const result = await this.exec("bash", [scriptPath(name), ...args]);
		const output = result.stdout.length > 0 ? result.stdout.trimEnd() : result.stderr.trimEnd();
		return { ok: result.code === 0, code: result.code, output };
	}

	private projectRootCache = new Map<string, string>();

	/** The scripts resolve .dld/ from the git root; the extension must match
	 * or a session started in a subdirectory sees a different filesystem. */
	private async projectRoot(ctx: LoopContext): Promise<string> {
		const cached = this.projectRootCache.get(ctx.cwd);
		if (cached) return cached;
		const result = await this.exec("git", ["-C", ctx.cwd, "rev-parse", "--show-toplevel"]);
		const root = result.code === 0 ? result.stdout.trim() : ctx.cwd;
		this.projectRootCache.set(ctx.cwd, root);
		return root;
	}

	/** Active run from a context, or null. Active slug resolution goes through run-state.sh. */
	private async activeRun(ctx: LoopContext): Promise<ActiveRun | null> {
		const root = await this.projectRoot(ctx);
		const active = await this.runScript("run-state.sh", ["active"]);
		if (!active.ok) return null;
		const slug = active.output.trim();
		if (!slug) return null;
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

		const next = await this.runScript("next-item.sh", [active.slug]);
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

		// Claim the item before dispatching so the next agent_end sees it as
		// in-flight rather than re-dispatching the same work. next-item.sh
		// prefers in-flight items, so claiming makes the loop single-threaded.
		const claimed = await this.runScript("run-state.sh", [
			"set-item-status",
			active.slug,
			String(item.index),
			"implementing",
		]);
		if (!claimed.ok) {
			ui.notify(`Could not claim item ${item.index}: ${claimed.output}`, "error");
			return false;
		}

		const decisions = item.decisions.map((d) => d.id).join(", ");
		ui.notify(`Continue goal run '${active.slug}'. Work item ${index} (${decisions}).`, "info");
		return true;
	}

	private async completeRun(slug: string, ctx: LoopContext, ui: LoopUi): Promise<void> {
		const result = await this.runScript("run-state.sh", ["set-status", slug, "complete"]);
		if (!result.ok) {
			ui.notify(`Could not complete run ${slug}: ${result.output}`, "error");
			return;
		}
		this.invalidate();
		await this.runScript("append-event.sh", [slug, "run-completed"]);

		// Surface findings if the agent recorded any.
		const count = await this.runScript("get-findings.sh", [slug, "--count"]);
		const findingCount = Number(count.output.trim());
		if (Number.isFinite(findingCount) && findingCount > 0) {
			const findings = await this.runScript("get-findings.sh", [slug]);
			if (findings.ok) {
				ui.card?.([
					`Run ${slug} complete — ${findingCount} finding${findingCount === 1 ? "" : "s"} recorded.`,
					"",
					...findings.output.split("\n").slice(0, 30),
				]);
			}
		}
		ui.notify(`Run ${slug} complete — every item is accepted or skipped.`, "info");
	}

	private async pauseRun(slug: string, ctx: LoopContext, ui: LoopUi, reason: string): Promise<void> {
		// A blocked item keeps its blocked status — pausing must not collapse
		// the distinction the contract's transition table makes.
		const result = await this.runScript("run-state.sh", ["set-status", slug, "paused"]);
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
		const result = await this.runScript("run-state.sh", ["set-status", active.slug, "paused"]);
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
		const verify = await this.runScript("verify-item.sh", [active.slug, String(item.index)]);

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
			const accepted = await this.runScript("run-state.sh", [
				"set-item-status",
				active.slug,
				String(item.index),
				"accepted",
			]);
			if (!accepted.ok) {
				ui.notify(`Could not mark item ${item.index} accepted: ${accepted.output}`, "error");
				return;
			}
			const repinned = await this.runScript("run-state.sh", ["repin-item", active.slug, String(item.index)]);
			if (!repinned.ok) {
				ui.notify(`Could not repin item ${item.index}: ${repinned.output}`, "error");
				return;
			}
			const eventAppended = await this.runScript("append-event.sh", [
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
			const retried = await this.runScript("run-state.sh", [
				"set-item-status",
				active.slug,
				String(item.index),
				"implementing",
			]);
			if (!retried.ok) {
				ui.notify(`Could not send item ${item.index} back for a retry: ${retried.output}`, "error");
				return;
			}
			ui.notify(`Item ${item.index} verification failed; retrying (attempt ${item.attempts + 1}).`, "warning");
			return;
		}

		const blocker = await this.runScript("block-item.sh", [
			active.slug,
			String(item.index),
			"--reason",
			verify.output,
		]);
		if (!blocker.ok) {
			ui.notify(blocker.output, "error");
			return;
		}
		ui.notify(blocker.output, "warning");
	}
}
