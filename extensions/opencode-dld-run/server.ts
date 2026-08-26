// @decision(DL-016) @decision(DL-017) @decision(DL-019) @decision(DL-020) @decision(DL-021)
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
import { readFileSync, existsSync } from "node:fs";
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

function packageRoot(): string {
	// fileURLToPath, not new URL().pathname — the latter leaves percent-
	// encoding in place, breaking checkouts under paths with spaces.
	const path = new URL(import.meta.url);
	const decoded = decodeURIComponent(path.pathname);
	return decoded.replace(/\/extensions\/opencode-dld-run\/server\.ts$/, "");
}

function scriptPath(name: string): string {
	return join(packageRoot(), "skills", "dld-run", "scripts", name);
}

// @decision(DL-017)
// Exec shim: run a script as an argv array — no shell. execFileSync never
// interprets $, backticks, quotes, or spaces in arguments, which is what
// DL-003 requires of anything that touches stored contract content.
//
// verify-item.sh gets a longer timeout and a larger buffer: it runs the
// project's test suite, which can take minutes and print megabytes. The
// defaults (30s, 1MB) would present as a verification failure and block
// the item — the worst failure mode for the longest-running script.
function runScript(
	name: string,
	args: string[],
	cwd: string,
): { code: number; stdout: string; stderr: string } {
	const isVerify = name === "verify-item.sh";
	try {
		const stdout = execFileSync("bash", [scriptPath(name), ...args], {
			cwd,
			encoding: "utf-8",
			timeout: isVerify ? 300_000 : 30_000,
			maxBuffer: isVerify ? 16 * 1024 * 1024 : 1024 * 1024,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return { code: 0, stdout, stderr: "" };
	} catch (e: unknown) {
		// execFileSync throws on non-zero exit, timeout, and buffer overflow;
		// the cast is confined here so callers see a uniform envelope.
		const err = e as {
			status?: number | null;
			signal?: string | null;
			stdout?: string;
			stderr?: string;
		};
		// A timeout (SIGTERM) is not a verification failure — code 3 marks
		// it as infrastructure so the loop surfaces rather than retry-and-block.
		if (err.signal === "SIGTERM") {
			return {
				code: 3,
				stdout: err.stdout ?? "",
				stderr: `script timed out: ${name}`,
			};
		}
		return {
			code: err.status ?? 1,
			stdout: err.stdout ?? "",
			stderr: err.stderr ?? String(e),
		};
	}
}

interface WorkItem {
	index: number;
	status: string;
	decisions: { id: string }[];
	attempts: number;
	evidence: unknown[];
}

interface RunState {
	schemaVersion: number;
	slug: string;
	title: string;
	status: string;
	review: "enabled" | "disabled";
	items: WorkItem[];
	bounds: { maxItems: number; maxMinutes: number };
}

function readRunState(runDir: string): RunState | undefined {
	const statePath = join(runDir, "state.json");
	if (!existsSync(statePath)) return undefined;
	try {
		const raw = JSON.parse(readFileSync(statePath, "utf-8"));
		if (raw.schemaVersion !== 1) return undefined;
		return raw as RunState;
	} catch {
		return undefined;
	}
}

interface StartArgs {
	slug: string;
	title: string;
	decisionIds: string[];
}

// @decision(DL-019)
// Ported from the Pi extension's parseStartArgs. The agent is the parser:
// ranges expand, slug and title are derived when not given.
//
//   /dld-run start DL-014..DL-022          → slug dl-14-22, 9 items
//   /dld-run start DL-014 - DL-022         → same
//   /dld-run start my-batch DL-014 DL-015  → slug my-batch, 2 items
//   /dld-run start my-batch --decisions DL-014,DL-015
function parseStartArgs(tokens: string[]): StartArgs | { error: string } {
	if (tokens.length === 0) {
		return {
			error: "Usage: /dld-run start <DL-NNN..DL-NNN | slug [title] decisions…>",
		};
	}

	// Range form: DL-014..DL-022 or DL-014 - DL-022 (spaces tolerated).
	const joined = tokens.join(" ");
	const rangeMatch = joined.match(/^(DL-\d+)\s*(?:\.\.|-|–|—|to)\s*(DL-\d+)$/i);
	if (rangeMatch) {
		const from = Number(rangeMatch[1]!.slice(3));
		const to = Number(rangeMatch[2]!.slice(3));
		if (
			!Number.isInteger(from) ||
			!Number.isInteger(to) ||
			from > to ||
			to - from > 50
		) {
			return { error: `Invalid range: ${rangeMatch[1]}..${rangeMatch[2]}` };
		}
		const ids = Array.from(
			{ length: to - from + 1 },
			(_, i) => `DL-${String(from + i).padStart(3, "0")}`,
		);
		return {
			slug: `dl-${String(from).padStart(3, "0")}-${String(to).padStart(3, "0")}`,
			title: `${rangeMatch[1]} through ${rangeMatch[2]}`,
			decisionIds: ids,
		};
	}

	const decisionFlag = tokens.indexOf("--decisions");
	let decisionIds: string[];
	let titleParts: string[];
	let slugSource: string | undefined;

	if (decisionFlag >= 0) {
		// --decisions as the first token has no slug — don't let the flag
		// itself become one.
		decisionIds = (tokens[decisionFlag + 1] ?? "").split(",").filter(Boolean);
		titleParts = tokens.slice(1, decisionFlag);
		slugSource = decisionFlag === 0 ? undefined : tokens[0];
	} else {
		// When the first token is a decision ID there is no explicit slug —
		// every positional token is a decision.
		const firstIsDecision = /^DL-\d+$/.test(tokens[0] ?? "");
		const source = firstIsDecision ? tokens : tokens.slice(1);
		decisionIds = source.filter((p) => /^DL-\d+$/.test(p));
		titleParts = source.filter((p) => !/^DL-\d+$/.test(p));
		slugSource = firstIsDecision ? undefined : tokens[0];
	}

	if (decisionIds.length === 0) {
		return {
			error:
				"A run needs decisions. Try /dld-run start DL-014..DL-022 or /dld-run start my-batch DL-014 DL-015",
		};
	}

	const slug =
		slugSource ??
		`dl-${decisionIds[0]!.slice(3).padStart(3, "0")}-${decisionIds[decisionIds.length - 1]!.slice(3).padStart(3, "0")}`;
	const title =
		titleParts.join(" ") || (slugSource ?? `${decisionIds[0]} batch`);
	return { slug, title, decisionIds };
}

// A single line from `run-state.sh active|list` — the scripts print one
// slug per line, and multiple active runs are possible after crashes.
function firstLine(s: string): string {
	return s.trim().split("\n")[0]?.trim() ?? "";
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

		// Dispatch guard: which item each session was last told to work.
		// Without this, every execution.succeeded re-dispatches the in-flight
		// item — the agent ends a turn mid-item (question, rate limit, context
		// boundary) and the loop spams the identical prompt. An item is only
		// re-dispatched when the session changes (restart/resume) or the item
		// itself advances.
		const lastDispatch = new Map<string, string>();

		// Resolve the run to operate on: the active one if any, otherwise
		// (for resume/status/stop) the most recent paused or blocked one.
		function resolveSlug(root: string, resumable: boolean): string | null {
			const active = runScript("run-state.sh", ["active"], root);
			if (active.code === 0 && active.stdout.trim())
				return firstLine(active.stdout);
			if (!resumable) return null;
			const list = runScript("run-state.sh", ["list"], root);
			if (list.code !== 0) return null;
			const lines = list.stdout
				.split("\n")
				.filter((l) => /\s(paused|blocked)$/.test(l));
			const last = lines[lines.length - 1];
			return last ? (last.split(/\s+/)[0] ?? null) : null;
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
						const existing = resolveSlug(root, false);
						if (existing) {
							await ctx.session.synthetic({
								sessionID,
								text: `[dld-run plugin] A run is already active: ${existing}. Relay this to the user as-is.`,
							});
							return;
						}
						const parsed = parseStartArgs(args.slice(1));
						if (!("slug" in parsed)) {
							await ctx.session.synthetic({
								sessionID,
								text: `[dld-run plugin] ${parsed.error} Relay this to the user as-is.`,
							});
							return;
						}
						// Preconditions first: dirty tree, active run, non-proposed
						// decisions, and ID collisions all refuse before anything
						// is created.
						const guard = runScript(
							"guard-preconditions.sh",
							["start", "--decisions", parsed.decisionIds.join(",")],
							root,
						);
						if (guard.code !== 0) {
							await ctx.session.synthetic({
								sessionID,
								text: `[dld-run plugin] Preconditions failed: ${guard.stdout.trim() || guard.stderr.trim()} Relay this to the user as-is.`,
							});
							return;
						}
						const created = runScript(
							"create-run.sh",
							["--slug", parsed.slug, "--title", parsed.title],
							root,
						);
						if (created.code !== 0) {
							await ctx.session.synthetic({
								sessionID,
								text: `[dld-run plugin] Could not create run: ${created.stdout.trim() || created.stderr.trim()} Relay this to the user as-is.`,
							});
							return;
						}
						for (const id of parsed.decisionIds) {
							const added = runScript(
								"run-state.sh",
								["add-item", parsed.slug, "--decisions", id],
								root,
							);
							if (added.code !== 0) {
								// A half-populated run must not go live — the loop would
								// start working it with items silently missing.
								const blocked = runScript(
									"run-state.sh",
									["set-status", parsed.slug, "blocked"],
									root,
								);
								const rollbackNote =
									blocked.code === 0
										? "The run is blocked; add the missing items manually or recreate it."
										: "CRITICAL: the run is still ACTIVE and half-populated — stop it manually with run-state.sh set-status before doing anything else.";
								await ctx.session.synthetic({
									sessionID,
									text: `[dld-run plugin] Run ${parsed.slug} created but item ${id} failed: ${added.stdout.trim() || added.stderr.trim()} ${rollbackNote} Relay this to the user as-is.`,
								});
								return;
							}
						}
						// Kick the loop: prompt the agent to start work now.
						lastDispatch.set(sessionID, `${parsed.slug}:1`);
						await ctx.session.prompt({
							sessionID,
							text: `Started goal run '${parsed.slug}' — ${parsed.decisionIds.length} item${parsed.decisionIds.length === 1 ? "" : "s"} (${parsed.title}). Begin work on item 1 as the dld-run skill describes.`,
							delivery,
						});
						return;
					}

					if (sub === "status") {
						const slug = resolveSlug(root, true);
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
						const slug = resolveSlug(root, sub === "resume" || sub === "stop");
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
							const guard = runScript(
								"guard-preconditions.sh",
								["resume", slug],
								root,
							);
							if (guard.code !== 0) {
								await ctx.session.synthetic({
									sessionID,
									text: `[dld-run plugin] Cannot resume: ${guard.stdout.trim() || guard.stderr.trim()} Relay this to the user as-is.`,
								});
								return;
							}
						}
						const past = sub === "stop" ? "stopped" : sub + "d";
						const result = runScript(
							"run-state.sh",
							["set-status", slug, target],
							root,
						);
						if (result.code === 0) {
							runScript("append-event.sh", [slug, `run-${past}`], root);
							if (sub === "resume") {
								// Clear the dispatch guard so the in-flight item gets
								// re-delivered to this session, and interrupt any turn
								// still running so the continuation lands immediately.
								lastDispatch.delete(sessionID);
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
						const msg =
							result.code === 0
								? `[dld-run plugin] Run ${slug} ${past}. Relay this to the user as-is.`
								: `[dld-run plugin] Failed to ${sub} run ${slug}: ${result.stderr.trim()} Relay this to the user as-is.`;
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

			const verify = runScript(
				"verify-item.sh",
				[slug, String(item.index)],
				root,
			);

			if (verify.code === 0) {
				if (state.review === "enabled") {
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
				const accepted = runScript(
					"run-state.sh",
					["set-item-status", slug, String(item.index), "accepted"],
					root,
				);
				if (accepted.code !== 0) {
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Could not mark item ${item.index} accepted: ${accepted.stderr.trim()} Relay this to the user as-is.`,
					});
					return;
				}
				const repinned = runScript(
					"run-state.sh",
					["repin-item", slug, String(item.index)],
					root,
				);
				if (repinned.code !== 0) {
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Could not repin item ${item.index}: ${repinned.stderr.trim()} Relay this to the user as-is.`,
					});
					return;
				}
				const eventAppended = runScript(
					"append-event.sh",
					[
						slug,
						"item-accepted",
						"--data",
						JSON.stringify({ index: item.index }),
					],
					root,
				);
				if (eventAppended.code !== 0) {
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Could not record item ${item.index} acceptance: ${eventAppended.stderr.trim()} Relay this to the user as-is.`,
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
			if (item.attempts < 2) {
				runScript(
					"run-state.sh",
					["set-item-status", slug, String(item.index), "implementing"],
					root,
				);
				// Clear the dispatch guard so the retry is delivered.
				lastDispatch.delete(sessionID);
				await ctx.session.synthetic({
					sessionID,
					text: `[dld-run plugin] Item ${item.index} verification failed; retrying (attempt ${item.attempts + 1} of 2). Failure output:\n${verify.stdout.trim().split("\n").slice(0, 10).join("\n")}`,
				});
				return;
			}

			runScript(
				"block-item.sh",
				[
					slug,
					String(item.index),
					"--reason",
					verify.stdout.trim() || "verification failed",
				],
				root,
			);
			runScript("run-state.sh", ["set-status", slug, "paused"], root);
			runScript(
				"append-event.sh",
				[
					slug,
					"run-paused",
					"--data",
					JSON.stringify({ reason: `item ${item.index} blocked` }),
				],
				root,
			);
			await ctx.session.synthetic({
				sessionID,
				text: `[dld-run plugin] Item ${item.index} blocked after two failed verifications; run ${slug} paused. Failure output:\n${verify.stdout.trim().split("\n").slice(0, 10).join("\n")}\nRelay this to the user as-is.`,
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

				const active = runScript("run-state.sh", ["active"], root);
				// A failed script (missing jq, unreadable state, timeout) is not
				// "no run" — skip silently and let the next event retry.
				if (active.code !== 0) continue;
				const slug = firstLine(active.stdout);
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

				// Bounds check.
				const done = state.items.filter(
					(i) => i.status === "accepted" || i.status === "skipped",
				).length;
				if (state.bounds.maxItems > 0 && done >= state.bounds.maxItems) {
					runScript("run-state.sh", ["set-status", slug, "paused"], root);
					runScript(
						"append-event.sh",
						[slug, "run-paused", "--data", `{"reason":"maxItems reached"}`],
						root,
					);
					continue;
				}

				// Find the next item.
				const next = runScript("next-item.sh", [slug], root);
				if (next.code === 2) {
					// Blocked item — pause and surface it. A silent pause reads
					// as a wedged run.
					runScript("run-state.sh", ["set-status", slug, "paused"], root);
					runScript(
						"append-event.sh",
						[slug, "run-paused", "--data", `{"reason":"blocked item"}`],
						root,
					);
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Run ${slug} paused: an item is blocked and needs an operator answer. Run /dld-run status for details. Relay this to the user as-is.`,
					});
					continue;
				}
				if (next.code !== 0) continue; // script failure — skip, do not complete
				const itemIndex = firstLine(next.stdout);
				if (!itemIndex) {
					// Exit 0 with empty stdout: genuinely nothing left.
					runScript("run-state.sh", ["set-status", slug, "complete"], root);
					runScript("append-event.sh", [slug, "run-completed"], root);
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Run ${slug} complete — every item is accepted or skipped. Relay this to the user as-is.`,
					});
					continue;
				}

				// The dispatch guard: don't re-deliver the item this session is
				// already working. The agent can end a turn mid-item (question,
				// rate limit, context boundary); that turn's completion must not
				// trigger an identical re-dispatch.
				const dispatchKey = `${slug}:${itemIndex}`;
				if (lastDispatch.get(sessionID) === dispatchKey) continue;

				const item = state.items[Number(itemIndex) - 1];
				if (!item) continue;

				// Claim the item before dispatching. A failed claim aborts the
				// dispatch — next-item would re-offer the same item next event
				// and the loop would claim-dispatch-spin without writing anything.
				const claimed = runScript(
					"run-state.sh",
					["set-item-status", slug, itemIndex, "implementing"],
					root,
				);
				if (claimed.code !== 0) {
					await ctx.session.synthetic({
						sessionID,
						text: `[dld-run plugin] Could not claim item ${itemIndex} of run ${slug}: ${claimed.stderr.trim()} Relay this to the user as-is.`,
					});
					continue;
				}

				lastDispatch.set(sessionID, dispatchKey);
				const decisions = item.decisions.map((d) => d.id).join(", ");
				try {
					await ctx.session.prompt({
						sessionID,
						text: `Continue goal run '${slug}'. Work item ${itemIndex} (${decisions}). Implement the decision(s) as the dld-run skill describes.`,
					});
				} catch {
					// Dispatch failed — clear the guard so the next event retries.
					lastDispatch.delete(sessionID);
				}
			}
		})().catch(() => {});

		return () => controller.abort();
	},
});
