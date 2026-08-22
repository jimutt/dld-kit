# Long-Running Goal Execution — Design Plan

## Overview

> **Status:** decisions recorded as DL-001 through DL-005 (tag `dld-goal`). This document is the narrative design; the decision records are the authoritative log. Where they disagree, the decisions win.

DLD covers decision capture, implementation, and drift detection, but assumes a human paces the work: run `/dld-plan`, then `/dld-implement` per decision or batch. For large features — dozens of decisions, hours of agent work — this pacing is the bottleneck, and generic "goal loop" tooling (Ralph-style prompt re-injection) doesn't know about the decision log.

This plan adds long-running execution to DLD as two components:

- **`/dld-goal` skill** — orchestration contract. Authors a run contract from a plan group, paces implementation item by item, and gates each item's completion on mechanical verification.
- **`dld-goal` Pi extension** — loop machinery. Continuation across turns, fresh child sessions per work item, status UI, bounds, and crash recovery. The extension owns mechanics; the skill owns DLD semantics.

The design builds on a survey of the Pi goal-loop ecosystem (`pi-goal`, `pi-goal-x`, `pi-goal-list-loop-audit`, `pi-loop-mode`, `ralphi`, `pi-ralph-wiggum`, `pi-autoresearch`, and others). See the [Ecosystem findings](#ecosystem-findings) section for what was learned.

## Why DLD is a good foundation for this

Generic goal-loop extensions reinvent two things DLD already has:

1. **Durable work-item state.** Most extensions introduce a task file, checklist, or PRD JSON as the loop's memory. DLD's decision log is already an append-only, status-tracked, dependency-ordered work queue. `proposed` vs `accepted` is the done/pending distinction. The unit of work is a `dld-plan` tag group, and the completion condition — no `proposed` decisions remain in the group — is deterministic, read from the log itself rather than declared by the model.
2. **Completion verification.** Every serious loop extension converges on "the agent that did the work can't be the one to certify it." DLD already has the review subagent in `/dld-implement` and mechanical checks (`verify-annotations.sh`, tests). The goal loop composes these instead of building a new verifier.

What DLD lacks is purely the loop machinery: continuation, context rotation, progress tracking, bounds, and operator control.

## Core concepts

### Run contract — [DL-001](../../decisions/records/DL-001.md)

A run is one goal being executed. Its durable state lives in the repo, not in the agent session:

```
.dld/runs/<goal-slug>/
  contract.md       # Human-readable: objective, scope, criteria, bounds
  state.json        # Machine-readable: items, status, current pointer (atomic writes)
  events.jsonl      # Append-only event log: item started/verified/failed, pauses, audits
```

The contract is authored once at start (from a plan group or an ad-hoc set of decisions) and treated as immutable by the loop. If the underlying decisions change mid-run, the run is flagged for replanning rather than silently continuing against stale intent.

Each work item in `state.json` carries one or more decisions (see [Work items and batching](#work-items-and-batching)):

```json
{
  "decisions": [
    { "id": "DL-014", "hash": "sha256:..." },
    { "id": "DL-015", "hash": "sha256:..." }
  ],
  "status": "pending | implementing | verifying | accepted | blocked | failed",
  "acceptance": {
    "annotations": ["src/billing/vat.ts"],
    "checks": ["npm test -- src/billing"]
  },
  "evidence": []
}
```

Decision hashes pin the item to the decisions' content at contract-authoring time. If a decision is adjusted mid-run, the hash mismatch invalidates the item and any cached verification.

### Work items and batching — [DL-002](../../decisions/records/DL-002.md)

A work item is the unit of execution and verification. It is **one decision by default, but tightly coupled decisions batch into a single item** — the same rule `/dld-implement` already applies: decisions that touch the same code, share types, or depend on each other so heavily that implementing one without the others would produce incomplete or throwaway code are implemented together.

Batching is a property of the item, not an afterthought. A batched item carries a list of decision IDs and hashes, and the completion transaction applies to the batch as a whole: all decisions' annotations verified, all acceptance checks green, one review pass over the combined diff, then each decision flips to `accepted`. The gate stays per-item; the item just contains more than one decision.

The trade-off is real: a batched item's verification can't tell you *which* decision's code caused a failure, and the review subagent sees a bigger, colder diff. Keep batches small and only batch when the coupling is genuine. Items that merely share a tag or a namespace are not coupled — they execute separately.

### Completion as a transaction — [DL-003](../../decisions/records/DL-003.md)

An item completes only when all four steps pass, in order:

1. **Claim** — the implementing agent reports done (via `/dld-implement`'s normal flow).
2. **Mechanical check** — `verify-annotations.sh` passes; declared acceptance commands run and exit 0.
3. **Review** — the existing `implement_review` subagent approves the diff.
4. **Record** — status flips to `accepted` via `update-status.sh`, event appended to `events.jsonl`.

A claim alone never closes an item. This follows the strongest pattern in the ecosystem survey (independent audit in GLLA/pi-goal-x, deterministic shell checks in pi-loop-mode) and reuses machinery DLD already trusts.

### Context rotation

Each work item runs in a **fresh child session** (the ralphi / Huntley pattern). The child receives only what it needs: the decision record, `PRACTICES.md`, the relevant slice of `INDEX.md`, and a bounded digest of recent run events. The decision log on disk is the shared memory; nothing important lives only in conversation history.

This matters more for DLD than for generic loops: a decision's rationale must never survive solely as a compaction artifact. When compaction happens, the compacted context is rebuilt deterministically from `state.json` and the decision records, not from an LLM summary alone.

The parent session acts as controller: it selects the next item, spawns the child, collects the result, runs the completion transaction, and advances. Between items it can run a scoped `/dld-audit` on touched files as a regression shield — catching cases where implementing DL-015 quietly drifted DL-012.

### Blocked items — [DL-004](../../decisions/records/DL-004.md)

An item becomes `blocked` when its completion transaction fails — a check won't pass, the review finds a critical issue the agent can't resolve, or the implementation hits a genuine contradiction with an existing decision.

Retry policy: the item retries **once** with the failure evidence added to the implementation context (failing check output, review findings). A second failure blocks the item and pauses the run.

Escalation is a **question to the operator, recorded in the run** — an entry in `events.jsonl` and a `blockedQuestions` list in `state.json` capturing what's failing, what was tried, and the options. The answer is recorded the same way, so the run's history shows why the path changed. A blocker is operational ("the migration conflicts with production data volume"), not a design choice, so it doesn't belong in the decision log. If resolving a blocker turns out to *require* a real design change, that goes through the normal `/dld-decide` flow as a separate, human-driven step — never created by the loop itself.

While paused on a blocked item, the operator can: answer the question and resume, skip the item (marked `skipped`, run continues), or stop the run entirely.

### Bounds and operator control

Defaults are conservative:

- Max items per run, max wall-clock time, optional token budget.
- One active run per worktree. Parallel runs require separate worktrees or a proven disjoint set of affected paths.
- No automatic push, PR, or merge. Opening a PR is a separate, gated step.
- Pause/resume/stop/cancel at run level. User input suspends continuation; Esc pauses (Pi conventions).
- Any mutation of an `accepted` decision's body remains forbidden, run or no run — the existing immutability rule wins over loop autonomy.

## The `/dld-goal` skill

The skill is the harness-agnostic half. In Claude Code (or Pi without the extension) it runs as a **manually paced loop** — the agent works through the contract item by item within one conversation, and the user nudges it along. With the extension present, the same contract is executed autonomously.

### `/dld-goal start <tag | DL-NNN...>`

1. Collect the goal: a plan-group tag, an explicit list of decision IDs, or a feature description (which routes through `/dld-plan` first).
2. Verify all referenced decisions exist and are `proposed`. Refuse to start if any are missing or already `accepted` (unless the user explicitly wants re-verification).
3. Order items by dependency (from planning context and `supersedes`/`amends` relationships).
4. Ask for acceptance checks per item where the default (annotations verified + project test suite) is insufficient.
5. Ask for bounds: max items, max time, whether to run the regression-shield audit between items.
6. Write `contract.md`, `state.json`, and the first `events.jsonl` entry.
7. Begin execution (or hand off to the extension if installed).

### `/dld-goal status | pause | resume | stop`

Status reads `state.json` and the event log — it never reconstructs from conversation. Pause/stop write a terminal event so a later resume knows where things stood. Resume re-reads the contract and decision records from disk, re-validates decision hashes, and continues from the first non-terminal item.

### Execution loop (manual mode)

For each `pending` item, in order:

1. Mark item `implementing`, append event.
2. Run the `/dld-implement DL-NNN` flow for that decision (in a fresh session when the extension drives it).
3. Run the completion transaction. On failure, mark `blocked` with the failing evidence, append event, and either retry with the failure as context (bounded retries) or stop for human input.
4. Mark `accepted`, append event.
5. Optionally run the scoped regression-shield audit.

When no `pending` items remain: append a `run-complete` event, suggest `/dld-snapshot` to refresh the projection, and stop.

## The Pi extension — [DL-005](../../decisions/records/DL-005.md)

The extension implements what a skill can't: harness lifecycle control. It reads the same contract files, so runs can move between manual skill mode and autonomous extension mode.

### Surface

- **Commands:** `/dld-goal start|status|pause|resume|stop|cancel` (delegating contract authoring to the skill where interaction is needed).
- **Continuation:** on `agent_end`, if the run is active, the agent is idle, and no user message is pending, queue the next step — either the next item's child session or the current item's verification phase. A monotonic run token invalidates stale queued continuations (the standard guard against double-dispatch after pause/resume races).
- **Child sessions:** one per work item via `ctx.fork`/new-session APIs, steered with a bounded brief. Child transcripts are referenced from `events.jsonl`.
- **Compaction:** on `session_before_compact`, supply a deterministic summary built from `state.json` + decision records instead of relying on a generic LLM summary (the `pi-autoresearch` pattern).
- **UI:** a status widget showing run name, current item, items accepted/total, and elapsed time. Kept small — pi-goal-x's history shows large live widgets can wipe terminal scrollback.
- **Persistence:** `state.json` written atomically (tmp + rename); `events.jsonl` append-only; Pi session entries (`pi.appendEntry`) only mirror state for branch-local UI and reload recovery. Repo files are authoritative.

### Recovery

On session start with an active run in `.dld/runs/`:

1. Distinguish: active owner (another live session owns this run — notify only), stale owner (heartbeat expired — offer to reclaim), completed child with unprocessed output (process it), corrupt ledger (quarantine the malformed tail, reconstruct from events).
2. Never treat missing or corrupt state as completion.
3. Re-validate decision hashes before resuming; mismatch → require explicit user decision.

## What we deliberately don't build (yet)

- **Endless/improvement loops.** `pi-loop-mode`-style unbounded operation conflicts with DLD's premise that work is scoped by decisions. The run ends when the plan group is done.
- **A detached auditor process.** GLLA's fresh-process auditor is the strongest verification boundary in the ecosystem, but it's heavy machinery (watchdogs, process-tree management, a large hardening history). The in-session review subagent plus mechanical checks is the right strength for v1; process isolation can come later if false approvals become a real problem.
- **Anti-degeneration machinery.** Repetition detection, stuck ladders, and rescue models matter for multi-day unattended loops. With bounded item-scoped runs and fresh contexts per item, the failure modes these address are much weaker.
- **Metric loops.** No `measure=` fitness functions — DLD goals are discrete decision sets, not optimization targets.

## Build order

1. **`/dld-goal` skill (manual pacing).** ✅ Done — 10 scripts, 305 bats tests, validated end-to-end.
2. **Extension v1: in-session continuation.** ✅ Done — `/dld-goal` commands with tolerant start syntax (`DL-014..DL-022`), scheduled `agent_end` continuation with suspension on user input and Esc, completion transaction honouring review mode, layered UI (status line, fixed-height widget, transcript cards, board overlay), active-time bounds. 96 bun tests alongside the bats suite. DL-006 through DL-014 accepted.
3. **Extension v2: child sessions + deterministic compaction.** Fresh session per item, disk-backed recovery, deterministic compaction summaries (DL-009, DL-010, still proposed).
4. **Later, if earned:** detached auditor process, regression-shield audit automation, `/dld-audit-auto` integration for fully unattended runs with a PR at the end.

Each stage ships usable; later stages only add autonomy.

## Open questions

- **Contract granularity (resolved — batching allowed).** A work item is one decision by default; tightly coupled decisions batch into one item following `/dld-implement`'s existing rule. See [Work items and batching](#work-items-and-batching). Remaining granularity question: is there a practical upper bound on batch size (decision count or diff size) beyond which the completion gate gets too coarse to be meaningful?
- **Blocked-item policy (resolved).** One retry with failure context, then the item blocks and the run pauses on an operator question recorded in the run's state/event log — not a decision record. Design changes that emerge from a blocker go through `/dld-decide` as a separate human step. See [Blocked items](#blocked-items).
- **Cross-run interaction with `/dld-reindex` (resolved).** A reindex mid-run renames decision IDs and rewrites annotations, invalidating the contract's decision references and hashes. Runs therefore **refuse to start** on branches with unresolved ID collisions, and **hard-pause** if a collision is detected mid-run (e.g., after a pull or merge brings in a conflicting decision). The resolution path is always `/dld-reindex` first, then resume — the loop never works around it.
- **Team visibility (resolved).** Run artifacts are **local state, gitignored by default**; decisions are the persistent artifacts. `/dld-goal start` adds `.dld/runs/` to `.gitignore` on first run. A developer can opt out per-project (`dld.config.yaml`) if they want run history committed as an audit trail, but the default assumes the decision log is the reviewable record and run state is ephemeral working state.

## Ecosystem findings

Condensed from research on Pi goal/loop extensions. Full briefs: `.pi-subagents/artifacts/` (per-extension detail, broader ecosystem survey).

### The spectrum of approaches

| Dimension | Weak / simple | Strong / heavy |
|---|---|---|
| Completion authority | Model self-declares (`<promise>COMPLETE</promise>`, `update_goal`) | Deterministic shell check (`pi-loop-mode --check`), independent auditor session/process (`pi-goal-x`, GLLA) |
| Context model | Same session + normal compaction, goal re-injected each turn (`pi-goal`, `pi-ralph-wiggum`) | Fresh child session per work unit, disk is the only memory (`ralphi`, Huntley's original loop) |
| State | Pi session entries only (branch-local, lost with the session) | Append-only ledger + atomic snapshot in the repo, state reconstructible after crashes (`pi-autoresearch`, `lnilluv/pi-ralph-loop`) |
| Anti-drift | Prompt instructions | Trajectory guards, reflection cadence (`ralphi`), repetition/stuck detection (`pi-loop-mode`) |

### Findings that shaped this design

- **Completion claims must open a gate, not close the loop.** Even the simplest extensions moved toward requiring externally rerunnable evidence. GLLA's framing: letting the agent that did the work also certify it is "the bamboozle trap." Our four-part transaction is this principle applied to DLD's existing machinery.
- **Fresh context per unit beats long same-session runs** for hygiene and for crash recovery, at the cost of session-switching overhead. DLD's decision records make the handoff brief cheap to construct — the rationale is already written down.
- **Deterministic state reconstruction beats LLM summaries.** `pi-autoresearch` replaces generic compaction with a summary assembled from persisted goal/rules/run history. For DLD this is non-negotiable: decision rationale must come from the log, not from what a compactor remembered.
- **Loop mechanics are a solved, commoditized problem.** `agent_end` continuation with idle checks, run tokens against stale callbacks, append-only ledgers, atomic snapshots — all well-established. The novel work here is wiring them to the decision log, not inventing loop machinery.
- **Every extension executes with full user privileges; none is a sandbox.** Guardrails (bounds, one run per worktree, no auto-push) reduce accidents but aren't a security boundary. Unattended runs belong in disposable worktrees or containers.
- **Rich implementations accumulate hardening debt.** GLLA and pi-goal-x have extensive histories of fixing watchdog hangs, stale callbacks, widget scrollback wipes, and cross-process races. Scope discipline at the start is cheaper than hardening later — hence the staged build order.
