// @decision(DL-016) @decision(DL-017) @decision(DL-019) @decision(DL-020) @decision(DL-021) @decision(DL-023)
// OpenCode V2 server plugin: the dld-run loop driver.
//
// Subscribes to session.execution.succeeded, reads the active run from
// .dld/runs/ via the shared bash scripts, and dispatches continuation
// prompts through ctx.session.prompt. The state layer is identical to
// the Pi extension — same scripts, same .dld/runs/ layout, same jq.
//
// The workspace root comes from session.location.directory, not
// process.cwd() — the plugin runs in OpenCode's server process, which
// may have a different working directory than the project.

import { Plugin } from "@opencode-ai/plugin";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { packageRoot } from "../dld-core/paths.ts";
import {
	readRunFrom,
	type RunState,
	type WorkItem,
} from "../dld-core/run-state.ts";
import {
	activeRun,
	appendRunEvent,
	blockItem,
	completeRun,
	defaultExec,
	guardPreconditions,
	nextItem,
	pauseRun,
	repinItem,
	resumableRun,
	resumeRun,
	setItemStatus,
	stopRun,
	startRun,
	verifyItem,
	type Exec,
} from "../dld-core/run-api.ts";

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

// The plugin's exec: dld-core's default (argv, no shell, verify gets the
// long timeout). Typed as Exec so the seam is explicit if OpenCode ever
// needs a different substrate.
const exec: Exec = defaultExec;

// readRunState wraps dld-core's validated reader in the plugin's
// undefined-on-failure convention.
function readRunState(runDir: string): RunState | undefined {
	const read = readRunFrom(runDir);
	return read.ok ? read.state : undefined;
}

export default Plugin.define({
	id: "dld-run",
	tui: true,
	async setup(ctx) {
		// Workspace root per project directory, not a single global — one
		// server can host sessions in several projects.
		const roots = new Map<string, string>();
		async function rootFor(sessionID: string): Promise<string> {
			const session = await ctx.session.get({ sessionID });
			const dir = (session as { location?: { directory?: string } }).location
				?.directory;
			if (!dir) throw new Error("session has no location.directory");
			const cached = roots.get(dir);
			if (cached) return cached;
			const root = projectRoot(dir);
			roots.set(dir, root);
			return root;
		}

		// Dispatch guard (DL-020) with bounded re-delivery (DL-023).
		//
		// lastDispatch records which item each session was last told to work;
		// without it every execution.succeeded re-dispatches the in-flight item
		// and the loop spams. But a pure guard deadlocks: a turn that ends
		// without advancing the item (rate limit, context boundary, the agent
		// asking a question) leaves the item in-flight and suppressed forever.
		//
		// The bound: one re-delivery per item per session. The first
		// suppression re-delivers (the turn may have ended for reasons
		// unrelated to the work); the second surfaces a wedge message and the
		// loop stays quiet. redispatched tracks the one allowed retry.
		const lastDispatch = new Map<string, string>();
		const redispatched = new Set<string>();
		const wedged = new Set<string>();

		// @decision(DL-023)
		// The dispatch prompt carries the state-machine protocol inline, so a
		// run works in projects without the dld-run skill loaded. "As the
		// skill describes" is a dangling reference when the skill isn't
		// there — the loop's correctness can't depend on content it doesn't
		// control. Keep it to mechanics; the skill owns rationale and review.
		function dispatchText(slug: string, index: number, item: WorkItem): string {
			const decisions = item.decisions.map((d) => d.id).join(", ");
			const scripts = join(packageRoot(), "skills", "dld-run", "scripts");
			return [
				`Continue goal run '${slug}'. Work item ${index} (${decisions}). Read the decision record(s) in decisions/records/ and implement them.`,
				"",
				"The run's state machine is file-based and you drive it with the scripts:",
				`- When the implementation is done: bash ${join(scripts, "run-state.sh")} set-item-status ${slug} ${index} verifying — then add evidence of the verification you ran (test commands, their results) with bash ${join(scripts, "run-state.sh")} add-evidence ${slug} ${index} '<short description>'.`,
				`- Never mark the item accepted yourself — the run plugin verifies the evidence and accepts or rejects the item.`,
				`- If you hit a genuine blocker: bash ${join(scripts, "block-item.sh")} ${slug} ${index} --reason '<what is needed>'.`,
				`- End your turn once the state is updated. The loop continues from there — do not ask whether to proceed.`,
			].join("\n");
		}

		// Resolve the run to operate on: the active one if any, otherwise
		// (for resume/status/stop) the most recent paused or blocked one.
		async function resolveSlug(root: string, resumable: boolean): Promise<string | null> {
			const active = await activeRun(exec, root);
			if (active.ok && active.value) return active.value;
			if (!resumable) return null;
			const resumableResult = await resumableRun(exec, root);
			return resumableResult.ok ? resumableResult.value : null;
		}

		// Register the /dld-run command.
		await ctx.command.transform((draft) => {
			draft.add({
				name: "dld-run",
				description: "Drive a goal run: start, pause, resume, stop, status",
				execute: async ({ sessionID, prompt, delivery }) => {
					const args = prompt.text.trim().split(/\s+/).filter(Boolean);
					const sub = args[0] ?? "status";

					let root: string;
					try {
						root = await rootFor(sessionID);
					} catch (e) {
						await ctx.session.synthetic({
							sessionID,
							text: `[dld-run plugin] Could not resolve the workspace: ${e instanceof Error ? e.message : String(e)}. Relay this to the user as-is.`,
						});
						return;
					}

					// @decision(DL-019)
					if (sub === "start") {
						const result = await startRun(exec, root, args.slice(1));
						if (!result.ok) {
							await ctx.session.synthetic({
								sessionID,
								text: `[dld-run plugin] ${result.error} Relay this to the user as-is.`,
							});
							return;
						}
						// Kick the loop: prompt the agent to start work now.
						lastDispatch.set(sessionID, `${result.slug}:1`);
						await ctx.session.prompt({
							sessionID,
							text: `Started goal run '${result.slug}' — ${result.itemCount} item${result.itemCount === 1 ? "" : "s"}. Begin work on item 1 as the dld-run skill describes.`,
							delivery,
						});
						return;
					}

					if (sub === "status") {
						const slug = await resolveSlug(root, true);
						if (!slug) {
							await ctx.session.synthetic({
								sessionID,
								text: "[dld-run plugin] No active or paused dld run. Relay this to the user as-is.",
							});
							return;
						}
						const state = readRunState(join(root, ".dld", "runs", slug));
						if (!state) {
							await ctx.session.synthetic({
								sessionID,
								text: `[dld-run plugin] Run ${slug} exists but state is unreadable. Relay this to the user as-is.`,
							});
							return;
						}
						const done = state.items.filter(
							(i) => i.status === "accepted" || i.status === "skipped",
						).length;
						const current = state.items.find(
							(i) => i.status === "implementing" || i.status === "verifying",
						);
						const statusText =
							`[dld-run plugin] Run ${slug}: ${done}/${state.items.length} items done` +
							(current
								? `, working on ${current.decisions.map((d) => d.id).join(",")}`
								: "") +
							`, status: ${state.status}. Relay this to the user as-is.`;
						await ctx.session.synthetic({ sessionID, text: statusText });
						return;
					}

					const statusMap: Record<string, string> = {
						pause: "paused",
						resume: "active",
						stop: "stopped",
					};
					const target = statusMap[sub];
					if (target) {
						const slug = await resolveSlug(root, sub === "resume" || sub === "stop");
						if (!slug) {
							await ctx.session.synthetic({
								sessionID,
								text: `[dld-run plugin] No ${sub === "resume" ? "resumable" : "active"} run to ${sub}. Relay this to the user as-is.`,
							});
							return;
						}
						// Resume re-validates preconditions (DL-004): the tree may
						// have gone dirty, collisions may have appeared, or decision
						// hashes may have drifted while the run sat idle.
						if (sub === "resume") {
							const guard = await guardPreconditions(exec, root, "resume", [slug]);
							if (!guard.ok) {
								await ctx.session.synthetic({
									sessionID,
									text: `[dld-run plugin] Cannot resume: ${guard.error} Relay this to the user as-is.`,
								});
								return;
							}
						}
						const past = sub === "stop" ? "stopped" : sub + "d";
						const lifecycleOp = { pause: pauseRun, resume: resumeRun, stop: stopRun }[sub as "pause" | "resume" | "stop"];
						const result = await lifecycleOp(exec, root, slug);
						if (result.ok) {
							if (sub === "resume") {
								// Clear the dispatch guard and re-delivery budgets so the
								// in-flight item gets re-delivered fresh (DL-023), and
								// interrupt any turn still running so the continuation
								// lands immediately.
								lastDispatch.delete(sessionID);
								redispatched.clear();
								wedged.clear();
								await ctx.session.prompt({
									sessionID,
									text: `Run ${slug} resumed. Continue the goal run as the dld-run skill describes.`,
									delivery,
								});
							} else if (sub === "pause") {
								// Pausing must stop the current work, not just the next
								// dispatch (DL-014).
								lastDispatch.delete(sessionID);
								try {
									await ctx.session.interrupt({ sessionID, continue: false });
								} catch {
									/* no turn in flight */
								}
							}
						}
						const msg = result.ok
							? `[dld-run plugin] Run ${slug} ${past}. Relay this to the user as-is.`
							: `[dld-run plugin] Failed to ${sub} run ${slug}: ${result.error} Relay this to the user as-is.`;
						await ctx.session.synthetic({ sessionID, text: msg });
						return;
					}

					// @decision(DL-019) — plugin messages become agent context, so
					// phrase them so the agent's correct action is to relay, not debug.
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Unknown subcommand: ${sub}. Use start, status, pause, resume, or stop. Relay this to the user as-is.`,
					});
				},
			});
		});

		// The completion transaction (DL-021): evidence counts per item, so
		// verify-item.sh runs once per new evidence batch, not per event.
		const verifiedAtEvidence = new Map<string, number>();
		const reviewNagged = new Set<string>();

		// The four-part completion transaction, ported from loop.ts onTurnEnd.
		// Runs before the dispatch check: an item in verification takes
		// priority over selecting new work.
		async function runCompletionTransaction(
			sessionID: string,
			root: string,
			slug: string,
			state: RunState,
		): Promise<void> {
			const item = state.items.find(
				(entry) =>
					entry.status === "verifying" &&
					entry.evidence.length > 0 &&
					entry.evidence.length !==
						verifiedAtEvidence.get(`${slug}:${entry.index}`),
			);
			if (!item) return;
			const key = `${slug}:${item.index}`;
			verifiedAtEvidence.set(key, item.evidence.length);

			const verify = await verifyItem(exec, root, slug, item.index);

			if (verify.kind === "infrastructure") {
				verifiedAtEvidence.delete(key);
				await ctx.session.synthetic({
					sessionID,
					text: `[dld-run plugin] Verification of item ${item.index} could not run: ${verify.error} The item stays verifying; fix the environment and it will retry. Relay this to the user as-is.`,
				});
				return;
			}

			if (verify.kind === "pass") {
				// Fail toward more review: anything that isn't explicitly
				// "disabled" requires it.
				if (state.review !== "disabled") {
					// The review is a judgment call the loop cannot make. Nag the
					// agent once per item; the skill's flow flips the item when
					// the review passes.
					if (!reviewNagged.has(key)) {
						reviewNagged.add(key);
						await ctx.session.synthetic({
							sessionID,
							text: `[dld-run plugin] Item ${item.index} passed mechanical checks but review is enabled — run the review subagent as the dld-run skill describes, then the item can be accepted.`,
						});
					}
					return;
				}
				// The transaction: accept → repin → event. Each step checked;
				// a failure aborts the rest and surfaces rather than half-writing.
				const accepted = await setItemStatus(
					exec,
					root,
					slug,
					item.index,
					"accepted",
				);
				if (!accepted.ok) {
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Could not mark item ${item.index} accepted: ${accepted.error} Relay this to the user as-is.`,
					});
					return;
				}
				const repinned = await repinItem(exec, root, slug, item.index);
				if (!repinned.ok) {
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Could not repin item ${item.index}: ${repinned.error} Relay this to the user as-is.`,
					});
					return;
				}
				const eventAppended = await appendRunEvent(
					exec,
					root,
					slug,
					"item-accepted",
					{ index: item.index },
				);
				if (!eventAppended.ok) {
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Could not record item ${item.index} acceptance: ${eventAppended.error} Relay this to the user as-is.`,
					});
					return;
				}
				await ctx.session.synthetic({
					sessionID,
					text: `[dld-run plugin] Item ${item.index} accepted (verification passed, review disabled) · ${item.decisions.map((d) => d.id).join(", ")}. Relay this to the user as-is.`,
				});
				return;
			}

			// attempts counts completed attempts; the skill's claim bumps it.
			// First failure retries, second blocks (DL-004).
			const failOutput =
				verify.kind === "fail" ? verify.output : "verification failed";
			if (item.attempts < 2) {
				setItemStatus(exec, root, slug, item.index, "implementing");
				// Clear the dispatch guard so the retry is delivered.
				lastDispatch.delete(sessionID);
				await ctx.session.synthetic({
					sessionID,
					text: `[dld-run plugin] Item ${item.index} verification failed; retrying (attempt ${item.attempts + 1} of 2). Failure output:\n${failOutput.split("\n").slice(0, 10).join("\n")}`,
				});
				return;
			}

			blockItem(
				exec,
				root,
				slug,
				item.index,
				failOutput || "verification failed",
			);
			await pauseRun(exec, root, slug, `item ${item.index} blocked`);
			await ctx.session.synthetic({
				sessionID,
				text: `[dld-run plugin] Item ${item.index} blocked after two failed verifications; run ${slug} paused. Failure output:\n${failOutput.split("\n").slice(0, 10).join("\n")}\nRelay this to the user as-is.`,
			});
		}

		// The continuation loop.
		const controller = new AbortController();
		void (async () => {
			for await (const event of ctx.event.subscribe({
				signal: controller.signal,
			})) {
				if (event.type !== "session.execution.succeeded") continue;
				const sessionID = (event as { data?: { sessionID?: string } }).data
					?.sessionID;
				if (!sessionID) continue;

				let root: string;
				try {
					root = await rootFor(sessionID);
				} catch {
					continue;
				}

				const active = await activeRun(exec, root);
				// A failed script (missing jq, unreadable state, timeout) is not
				// "no run" — skip silently and let the next event retry.
				if (!active.ok) continue;
				const slug = active.value;
				if (!slug) continue;
				const state = readRunState(join(root, ".dld", "runs", slug));
				if (!state || state.status !== "active") continue;

				// Completion takes priority over dispatch: an item awaiting
				// verification is resolved before new work is selected. The
				// transaction may pause the run (blocked item) — re-read the
				// status afterwards rather than dispatching on stale state.
				await runCompletionTransaction(sessionID, root, slug, state);
				const afterTx = readRunState(join(root, ".dld", "runs", slug));
				if (!afterTx || afterTx.status !== "active") continue;

				// Bounds check, on the post-transaction state.
				const done = afterTx.items.filter(
					(i) => i.status === "accepted" || i.status === "skipped",
				).length;
				if (afterTx.bounds.maxItems > 0 && done >= afterTx.bounds.maxItems) {
					await pauseRun(exec, root, slug, "maxItems reached");
					continue;
				}

				// Find the next item.
				const next = await nextItem(exec, root, slug);
				if (next.kind === "blocked") {
					// Blocked item — pause and surface it. A silent pause reads
					// as a wedged run.
					await pauseRun(exec, root, slug, "blocked item");
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Run ${slug} paused: an item is blocked and needs an operator answer. Run /dld-run status for details. Relay this to the user as-is.`,
					});
					continue;
				}
				if (next.kind === "error") continue; // script failure — skip, do not complete
				if (next.kind === "complete") {
					await completeRun(exec, root, slug);
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Run ${slug} complete — every item is accepted or skipped. Relay this to the user as-is.`,
					});
					continue;
				}

				const item = afterTx.items.find((i) => i.index === next.index);
				if (!item) continue;

				// The dispatch guard with bounded re-delivery (DL-023). The key
				// is session+item; the re-delivery budget is per key.
				const dispatchKey = `${slug}:${next.index}`;
				const sessionKey = `${sessionID}:${dispatchKey}`;
				if (lastDispatch.get(sessionID) === dispatchKey) {
					if (!redispatched.has(sessionKey)) {
						// First suppression: re-deliver once. The previous turn ended
						// without advancing the item — maybe a rate limit, maybe a
						// question. One more chance, then the loop speaks up.
						redispatched.add(sessionKey);
						await ctx.session.prompt({
							sessionID,
							text: dispatchText(slug, next.index, item),
						});
						continue;
					}
					// Second suppression: the item is wedged. Surface once, then
					// stay quiet — the user decides whether to nudge or pause.
					if (!wedged.has(sessionKey)) {
						wedged.add(sessionKey);
						await ctx.session.synthetic({
							sessionID,
							text: `[dld-run plugin] Item ${next.index} of run ${slug} appears wedged: two turns completed without the item advancing. Inspect the run (/dld-run status), nudge the agent, or pause the run. Relay this to the user as-is.`,
						});
					}
					continue;
				}

				// Claim the item before dispatching. A failed claim aborts the
				// dispatch — next-item would re-offer the same item next event
				// and the loop would claim-dispatch-spin without writing anything.
				const claimed = await setItemStatus(
					exec,
					root,
					slug,
					next.index,
					"implementing",
				);
				if (!claimed.ok) {
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Could not claim item ${next.index} of run ${slug}: ${claimed.error} Relay this to the user as-is.`,
					});
					continue;
				}

				lastDispatch.set(sessionID, dispatchKey);
				try {
					await ctx.session.prompt({
						sessionID,
						text: dispatchText(slug, next.index, item),
					});
				} catch {
					// Dispatch failed — clear the guard so the next event retries.
					lastDispatch.delete(sessionID);
					redispatched.delete(sessionKey);
				}
			}
		})().catch(() => {});

		return () => controller.abort();
	},
});
