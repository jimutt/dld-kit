---
name: dld-goal
description: Execute a set of proposed decisions as a long-running goal. Creates a run contract, works decisions item by item with verified completion, and tracks progress in durable run state.
compatibility: Requires bash, git, and jq. Scripts use BASH_SOURCE for path resolution.
---

# /dld-goal — Execute Decisions as a Long-Running Goal

You are running a **goal**: a set of `proposed` decisions executed one work item at a time, where each item's completion is verified before the next begins.

> **Build status:** Stage 1 is complete — the skill runs a goal as a manually paced loop in any harness. Autonomous continuation, child-session rotation per item, and a status widget arrive with the Pi extension (Stage 2). See `docs/plan/goal-loop.md`.

## Interaction style

Use the `AskUserQuestion` tool for all questions and prompts. This provides a structured input experience for the user rather than waiting for freeform replies.

## Script Paths

Shared scripts:
```
../dld-common/scripts/common.sh
```

Skill-specific scripts:
```
scripts/create-run.sh
scripts/run-state.sh
scripts/append-event.sh
scripts/decision-hash.sh
scripts/next-item.sh
scripts/verify-hashes.sh
scripts/guard-preconditions.sh
scripts/verify-item.sh
scripts/block-item.sh
scripts/resolve-block.sh
```

Cross-skill scripts:
```
../dld-common/scripts/update-status.sh
../dld-common/scripts/regenerate-index.sh
```

## Prerequisites

1. Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.
2. Check that `jq` is available. The scripts fail with installation guidance if it is missing.

## Run state

A run is durable, local state under `.dld/runs/<slug>/`:

- `contract.md` — objective and bounds, immutable for the life of the run
- `state.json` — items, statuses, and bounds (camelCase keys, atomic writes)
- `events.jsonl` — append-only log of what happened

Run artifacts are gitignored by default; decisions are the persistent record. See `docs/framework/run-contract.md` for the schema.

## Commands

### `/dld-goal start`

Create a run.

1. **Determine the goal.** A plan-group tag, an explicit list of decision IDs, or a description. Resolve it to a concrete set of `proposed` decisions and read each one — you cannot slice work you have not read.

2. **Propose a slicing and confirm it.** Present how the decisions group into work items and in what order, before anything is created. Use the `AskUserQuestion` tool.

   An item is one decision by default. Batch decisions into a single item only when they are genuinely coupled — they touch the same code, share types, or one produces throwaway code without the other. A shared tag or namespace is not coupling.

   Present the proposal as a table, with the reason for each grouping and the ordering:

   > Proposed slicing for `payment-gateway` — 3 items:
   >
   > | # | Decisions | Why grouped |
   > |---|-----------|-------------|
   > | 1 | DL-010 | Adapter interface — stands alone, everything else builds on it |
   > | 2 | DL-011, DL-012 | Retry strategy and idempotency keys share the request wrapper; splitting them means writing it twice |
   > | 3 | DL-013 | Error mapping — needs the interface from item 1 |
   >
   > Does this look right? Want to split, merge, or reorder any of it?

   Iterate until the user agrees. Prefer splitting when the coupling is arguable: a smaller item gives a sharper completion signal, and a batched item cannot tell you which decision caused a failed check. Flag any decision you could not order confidently and ask.

3. **Check it is safe to start.** A run pins decision IDs and hashes, so anything that rewrites decisions underneath it invalidates the run:

```bash
bash scripts/guard-preconditions.sh start --decisions "DL-010,DL-011,DL-012,DL-013"
```

This checks the working tree is clean, no other run is active, every decision exists and is `proposed`, and no decision IDs collide with the base branch. Any output is a blocker — resolve it before continuing. A collision means `/dld-reindex` first, always.

4. **Choose a slug.** Lowercase, hyphenated, derived from the objective (`payment-gateway`, not `Payment Gateway`).

5. **Propose bounds, don't just ask for them.** Derive a default from the slicing and offer it as the recommended option:

   - **Max items** — the number of items in the agreed slicing. The run should not outlive its plan.
   - **Max minutes** — roughly 20 minutes per *decision* in scope, not per item. A 3-item run covering 4 decisions defaults to 4 × 20 = 80 minutes. Round to something readable.

   > Bounds for this run — 3 items covering 4 decisions:
   >
   > - **Recommended:** 3 items, 80 minutes (4 decisions × 20 min)
   > - Tighter: 3 items, 45 minutes — stops early if work runs long
   > - No time limit: 3 items, unbounded

   Adjust the per-decision estimate when the decisions tell you to: wide-reaching changes, unfamiliar code, or heavy test suites justify more; a config change or a constant justifies less. Say which way you adjusted and why.

   Zero means unbounded. Prefer a real limit — a bound that stops a run early costs one resume, while an unbounded run that goes wrong costs the whole session.

6. **Create the run**, piping the objective via `printf` with `\n` escapes. Include the agreed slicing in the contract body — the contract is the immutable record of what was agreed:

```bash
printf "Implement the payment gateway decisions...\n\n## Agreed slicing\n\n| # | Decisions | Why grouped |\n..." | bash scripts/create-run.sh \
  --slug "payment-gateway" \
  --title "Payment gateway" \
  --max-items 8 \
  --max-minutes 120 \
  --body-stdin
```

Pass `--review disabled` only when the project sets `implement_review: false`; record that the run has a weaker completion gate.

7. **Create the items**, one per slice, in the agreed order. Each item pins its decisions by intent hash at this moment:

```bash
bash scripts/run-state.sh add-item payment-gateway --decisions "DL-010"
bash scripts/run-state.sh add-item payment-gateway --decisions "DL-011,DL-012" \
  --check "npm test -- src/payments"
bash scripts/run-state.sh add-item payment-gateway --decisions "DL-013"
```

Add `--check` for each acceptance command the item needs beyond the project default, and `--annotation <path>` where you already know which file must carry the annotation. Both can be filled in later as implementation reveals them.

Checks run without a shell. A check is split into argv on whitespace, and anything containing shell operators, quoting, or substitution is rejected — put those in a repo script and point the check at it:

```bash
--check "./scripts/check.sh billing"     # not "npm test && npm run lint"
```

Report the created run: item count, bounds, and the first item to be worked.

### Selecting work

Ask for the next item rather than tracking position yourself — the run state is the source of truth, not the conversation:

```bash
bash scripts/next-item.sh <slug>
```

It prints the index of the item to work, or nothing when every item is accepted or skipped. Exit code 2 means the run has a blocked item: stop and surface it to the user rather than moving to later work.

In-flight items win over later pending ones, so a resumed run finishes what it started.

### Checking for decision drift

Before starting an item, and always before resuming a paused run, confirm the decisions still say what they said when the run was planned:

```bash
bash scripts/verify-hashes.sh <slug>          # pending items
bash scripts/verify-hashes.sh <slug> --all    # on resume, include in-flight items
```

Any output means a decision changed. Stop the run and tell the user which decision drifted and how — do not replan silently, and do not implement against the new text on the assumption the change was harmless. Starting a fresh run is the normal resolution.

Refining a still-`proposed` decision *while implementing its own item* is legitimate and expected; that is why the default check ignores in-flight items. Re-pin when the item completes:

```bash
bash scripts/run-state.sh repin-item <slug> <index>
```

### `/dld-goal continue`

Work the next item. This is the loop: with no extension installed, each invocation advances the run by one item, and the run state — not this conversation — carries the position.

**Before every item:**

1. Check bounds. Read `bounds` and `createdAt`; count accepted items. If `maxItems` accepted items are done, or `maxMinutes` have elapsed, stop, set the run `paused`, log a `bounds-reached` event, and report. Do not quietly run past a bound the user set.
2. Check drift with `verify-hashes.sh` (above).
3. Select the item with `next-item.sh`. No output means the run is finished — go to *Completing the run*.

**Then work the item as a four-part transaction.** Nothing short of all four completes an item.

#### 1. Claim

```bash
bash scripts/run-state.sh set-item-status <slug> <index> implementing
bash scripts/run-state.sh bump-attempt <slug> <index>
bash scripts/append-event.sh <slug> item-started --data '{"item":<index>}'
```

Read the item's decisions and implement them exactly as `/dld-implement` describes — same practices manifest, same annotation rules, same restraint about comments. A batched item is implemented as one coherent change.

Refining a still-`proposed` decision as you implement it is allowed and expected; changing its *intent* is not. If the intent has to change, stop the item and raise it with the user.

When the code is written, claim the item:

```bash
bash scripts/run-state.sh set-item-status <slug> <index> verifying
```

#### 2. Mechanical check

```bash
bash scripts/verify-item.sh <slug> <index>
```

Annotations must exist for every decision in the item, and every acceptance check must exit 0. Evidence is recorded either way. A non-zero exit sends you to *When an item fails*.

#### 3. Review

Run the review step exactly as `/dld-implement` step 6 describes — same subagent, same prompt template, same severity handling. Do not reinvent it here.

If `review` is `disabled` in the run state, skip this step and say so in the run report: the completion gate is weaker for every item in the run.

Critical findings mean the item has not passed. Fix them and re-run step 2, or treat them as a failure if you cannot.

#### 4. Record

Only once steps 1–3 have all passed:

```bash
# Update each decision's references, then:
bash ../dld-common/scripts/update-status.sh DL-NNN accepted
bash scripts/run-state.sh repin-item <slug> <index>
bash scripts/run-state.sh set-item-status <slug> <index> accepted
bash scripts/append-event.sh <slug> item-accepted --data '{"item":<index>}'
bash ../dld-common/scripts/regenerate-index.sh
```

Re-pinning matters: it records the decision as implemented, so later drift checks compare against what was actually built.

Commit the item's work before moving on. One item, one commit, so a run's history is reviewable per unit and a failed later item does not muddy an earlier success.

### When an item fails

One retry, then escalate. The retry gets the failure as context — the point is to give the implementing agent what it lacked, not to roll dice again.

**First failure** (`attempts` is 1): read the evidence, fix the cause, return the item to `implementing`, and repeat the transaction. Say what you are retrying and why.

**Second failure** (`attempts` is 2): escalate. Do not try a third time.

```bash
bash scripts/block-item.sh <slug> <index> \
  --reason "acceptance check fails: 3 tests red after retry" \
  --question "Relax the check, fix the fixture, or skip this item?"
```

This blocks the item, pauses the run, and records the question in the run. Surface it to the user with `AskUserQuestion`, including what failed and what you already tried.

`block-item.sh` refuses to block before the retry has been used. Pass `--force` only when retrying genuinely cannot help — a missing dependency, a contradiction with an accepted decision, an environment the run cannot fix.

Record the answer and continue:

```bash
bash scripts/resolve-block.sh <slug> <index> --answer "<what the user said>" --action retry
bash scripts/resolve-block.sh <slug> <index> --answer "<what the user said>" --action skip
```

`skip` leaves the item's decisions `proposed` and moves the queue on. Say so in the final report — a run that finishes with skipped items has not finished the plan.

If resolving a blocker needs a real design change, stop and run `/dld-decide` with the user. Never write a decision record from inside a run.

### Completing the run

When `next-item.sh` returns nothing, every item is accepted or skipped:

```bash
bash scripts/run-state.sh set-status <slug> complete
bash scripts/append-event.sh <slug> run-complete
```

Report: items accepted, items skipped, decisions now `accepted`, and anything left `proposed`. Suggest `/dld-snapshot` to refresh the projection, and `/dld-audit` if the run skipped anything.

### `/dld-goal status`

Report the run: status, bounds, item progress, and recent events.

```bash
bash scripts/run-state.sh get <slug>
bash scripts/run-state.sh list
tail -20 .dld/runs/<slug>/events.jsonl
```

Summarize in a table rather than dumping raw JSON.

### `/dld-goal pause` / `resume` / `stop`

```bash
bash scripts/run-state.sh set-status <slug> paused
bash scripts/append-event.sh <slug> run-paused --data '{"reason":"user requested"}'
```

Valid statuses: `active`, `paused`, `blocked`, `complete`, `stopped`. `stop` is terminal — a stopped run is not resumed, a new run is started instead.

Every state change gets an event. The event log is how a later session, or the Pi extension, reconstructs what happened.

**Resuming** re-validates before doing any work:

```bash
bash scripts/guard-preconditions.sh resume <slug>
```

This checks the tree is clean, no ID collisions appeared while the run was idle, the run is resumable, and — including in-flight items — that no decision drifted. Every reported problem must be resolved before continuing; a collision means `/dld-reindex` first, and drift means replanning rather than implementing against changed intent.

Then set the run `active` and go to `/dld-goal continue`.

## Working without the Pi extension

This skill deliberately contains no loop machinery — no continuation after the agent stops, no child sessions, no timers. Those need harness lifecycle control, which lives in the Pi extension. `@decision(DL-005)`

Without the extension the run is *paced by the user*: each `/dld-goal continue` advances one item, and the durable state in `.dld/runs/` carries everything between invocations. That is a real workflow, not a degraded one — the contract, ordering, verification, and reporting all work. What you supply manually is the nudge to keep going.

Because state lives on disk rather than in conversation, a run started by hand can later be driven by the extension, and vice versa.

## Rules

- Never edit `contract.md` after creation. If the objective changed, stop the run and start a new one.
- Never hand-edit `state.json`. Use `run-state.sh` so writes stay atomic and `updatedAt` stays accurate.
- Never mark work complete on the agent's own say-so. All four transaction steps, every time — see `docs/framework/run-contract.md` and DL-003.
- Never author decision records from inside a run. Blockers are recorded as run questions; genuine design changes go through `/dld-decide` with the user.
- Never work past a blocked item. `next-item.sh` exits 2 for a reason.
- Never exceed the run's bounds. Pause and report instead.
- Never push, open a PR, or merge from inside a run. Committing per item is expected; publishing is the user's call.
