// @decision(DL-024) @decision(DL-003) @decision(DL-021)
// The completion transaction: the four-part gate (verify → review → accept →
// repin+event) that an item must pass before the loop moves on. Extracted
// from both harness loops into a single implementation so the invariant is
// maintained once, not twice by hand.
//
// The tracker owns the memoization (verifiedAtEvidence, reviewNagged) that
// prevents re-running verify-item.sh on every turn. The harness maps the
// outcome to its delivery surface (pi: notify + card; OpenCode: synthetic
// "Relay this to the user as-is" message).

import {
	verifyItem,
	setItemStatus,
	repinItem,
	blockItem,
	appendRunEvent,
	pauseRun,
	type Exec,
	type Result,
} from "./run-api.ts";
import type { RunState, WorkItem } from "./run-state.ts";

export type CompletionOutcome =
	| { kind: "none" }
	| { kind: "infrastructure"; index: number; error: string }
	| { kind: "review-required"; index: number }
	| { kind: "accepted"; index: number; decisionIds: string[]; evidence: unknown[] }
	| { kind: "retrying"; index: number; attempt: number; output: string }
	| { kind: "blocked"; index: number; output: string }
	| { kind: "error"; message: string };

export class CompletionTracker {
	/** Evidence count at the last verification per item, so verify-item.sh
	 * (which runs the project test suite) only re-runs when new evidence
	 * arrived, not on every turn the item sits in verifying. */
	private verifiedAtEvidence = new Map<string, number>();
	/** Items already told they are waiting on review, so the nag fires once
	 * per item, not every turn. */
	private reviewNagged = new Set<string>();

	/** Clear the memoized state — on resume, on new run, on explicit reset. */
	clear(): void {
		this.verifiedAtEvidence.clear();
		this.reviewNagged.clear();
	}

	/**
	 * Run the completion transaction for the given run state.
	 * Returns the outcome; the harness decides how to surface it.
	 */
	async step(exec: Exec, root: string, slug: string, state: RunState): Promise<CompletionOutcome> {
		const item = state.items.find(
			(entry) =>
				entry.status === "verifying" &&
				entry.evidence.length > 0 &&
				entry.evidence.length !== this.verifiedAtEvidence.get(`${slug}:${entry.index}`),
		);
		if (!item) return { kind: "none" };

		const key = `${slug}:${item.index}`;
		this.verifiedAtEvidence.set(key, item.evidence.length);

		const verify = await verifyItem(exec, root, slug, item.index);

		if (verify.kind === "infrastructure") {
			// A timeout is not a test failure. Un-memoize so the next turn
			// retries, and surface the error.
			this.verifiedAtEvidence.delete(key);
			return { kind: "infrastructure", index: item.index, error: verify.error };
		}

		if (verify.kind === "pass") {
			// Fail toward more review: anything that isn't explicitly
			// "disabled" requires it.
			if (state.review !== "disabled") {
				if (!this.reviewNagged.has(key)) {
					this.reviewNagged.add(key);
					return { kind: "review-required", index: item.index };
				}
				return { kind: "none" };
			}
			return this.acceptItem(exec, root, slug, item);
		}

		// Verify failed. attempts counts completed attempts: first failure
		// retries, second blocks.
		const output = (verify.kind === "fail" ? verify.output : "") || "verification failed";
		if (item.attempts < 2) {
			const retried = await setItemStatus(exec, root, slug, item.index, "implementing");
			if (!retried.ok) return { kind: "error", message: retried.error };
			return { kind: "retrying", index: item.index, attempt: item.attempts + 1, output };
		}

		const blocked = await blockItem(exec, root, slug, item.index, output);
		if (!blocked.ok) return { kind: "error", message: blocked.error };
		await pauseRun(exec, root, slug, `item ${item.index} blocked`);
		return { kind: "blocked", index: item.index, output };
	}

	/** The accept half of the transaction: accept → repin → event, each step
	 * checked. A failure aborts the rest and surfaces rather than half-writing. */
	private async acceptItem(exec: Exec, root: string, slug: string, item: WorkItem): Promise<CompletionOutcome> {
		const accepted = await setItemStatus(exec, root, slug, item.index, "accepted");
		if (!accepted.ok) return { kind: "error", message: `Could not mark item ${item.index} accepted: ${accepted.error}` };

		const repinned = await repinItem(exec, root, slug, item.index);
		if (!repinned.ok) return { kind: "error", message: `Could not repin item ${item.index}: ${repinned.error}` };

		const eventAppended = await appendRunEvent(exec, root, slug, "item-accepted", { index: item.index });
		if (!eventAppended.ok) return { kind: "error", message: `Could not record item ${item.index} acceptance: ${eventAppended.error}` };

		return {
			kind: "accepted",
			index: item.index,
			decisionIds: item.decisions.map((d) => d.id),
			evidence: item.evidence,
		};
	}
}
