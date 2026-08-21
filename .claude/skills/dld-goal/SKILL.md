---
name: dld-goal
description: Execute a set of proposed decisions as a long-running goal. Creates a run contract, works decisions item by item with verified completion, and tracks progress in durable run state.
user_invocable: true
---

# /dld-goal — Execute Decisions as a Long-Running Goal

You are running a **goal**: a set of `proposed` decisions executed one work item at a time, where each item's completion is verified before the next begins.

> **Build status:** the run lifecycle below (start, status, pause, resume, stop) is implemented. Item planning, verification, and the execution loop land in later slices of this feature — see `docs/plan/goal-loop.md`.

## Script Paths

Shared scripts:
```
.claude/skills/dld-common/scripts/common.sh
```

Skill-specific scripts:
```
.claude/skills/dld-goal/scripts/create-run.sh
.claude/skills/dld-goal/scripts/run-state.sh
.claude/skills/dld-goal/scripts/append-event.sh
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

1. Determine the goal: a plan-group tag, an explicit list of decision IDs, or a description. Confirm the objective with the user.
2. Choose a slug — lowercase, hyphenated, derived from the objective (`payment-gateway`, not `Payment Gateway`).
3. Ask for bounds: maximum items and maximum minutes. Zero means unbounded; prefer a real limit.
4. Create the run, piping the objective via `printf` with `\n` escapes:

```bash
printf "Implement the payment gateway decisions...\n" | bash .claude/skills/dld-goal/scripts/create-run.sh \
  --slug "payment-gateway" \
  --title "Payment gateway" \
  --max-items 8 \
  --max-minutes 120 \
  --body-stdin
```

Pass `--review disabled` only when the project sets `implement_review: false`; record that the run has a weaker completion gate.

### `/dld-goal status`

Report the run: status, bounds, item progress, and recent events.

```bash
bash .claude/skills/dld-goal/scripts/run-state.sh get <slug>
bash .claude/skills/dld-goal/scripts/run-state.sh list
tail -20 .dld/runs/<slug>/events.jsonl
```

Summarize in a table rather than dumping raw JSON.

### `/dld-goal pause` / `resume` / `stop`

```bash
bash .claude/skills/dld-goal/scripts/run-state.sh set-status <slug> paused
bash .claude/skills/dld-goal/scripts/append-event.sh <slug> run-paused --data '{"reason":"user requested"}'
```

Valid statuses: `active`, `paused`, `blocked`, `complete`, `stopped`. `stop` is terminal — a stopped run is not resumed, a new run is started instead.

Every state change gets an event. The event log is how a later session, or the Pi extension, reconstructs what happened.

## Rules

- Never edit `contract.md` after creation. If the objective changed, stop the run and start a new one.
- Never hand-edit `state.json`. Use `run-state.sh` so writes stay atomic and `updatedAt` stays accurate.
- Never mark work complete on the agent's own say-so. Completion is verified mechanically — see `docs/framework/run-contract.md` and DL-003.
- Never author decision records from inside a run. Blockers are recorded as run questions; genuine design changes go through `/dld-decide` with the user.
