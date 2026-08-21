# Goal Run Contract

A goal run is a set of `proposed` decisions executed as one long-running unit of work. Its state lives in the repository, not in an agent session, so it survives compaction, restarts, and crashes.

This document specifies the on-disk format. Two implementations read and write it — the `dld-goal` bash scripts and the Pi extension — so the schema is normative for both. See DL-001 for the rationale.

## Location

```
.dld/runs/<slug>/
  contract.md     # Human-readable objective and bounds. Immutable once created.
  state.json      # Machine-readable run state. Atomic writes only.
  events.jsonl    # Append-only event log, one JSON object per line.
```

`<slug>` is lowercase letters, digits, and hyphens, with no leading or trailing hyphen.

`.dld/` is gitignored by default. Set `goal_run_artifacts: commit` in `dld.config.yaml` to keep run history in version control instead.

## state.json

All keys are camelCase.

```json
{
  "schemaVersion": 1,
  "slug": "payment-gateway",
  "title": "Payment gateway",
  "status": "active",
  "createdAt": "2026-08-20T20:15:30Z",
  "updatedAt": "2026-08-20T21:02:11Z",
  "bounds": { "maxItems": 8, "maxMinutes": 120 },
  "review": "enabled",
  "currentItem": null,
  "items": [],
  "blockedQuestions": []
}
```

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | integer | Format version. Currently `1`. Readers reject versions they do not understand. |
| `slug` | string | Run identifier, matches the directory name. |
| `title` | string | Human-readable run name. |
| `status` | enum | `active`, `paused`, `blocked`, `complete`, `stopped`. |
| `createdAt` / `updatedAt` | string | UTC ISO-8601, second precision. `updatedAt` is refreshed on every write. |
| `bounds.maxItems` | integer | Item cap. `0` means unbounded. |
| `bounds.maxMinutes` | integer | Wall-clock cap in minutes. `0` means unbounded. |
| `review` | enum | `enabled` or `disabled`. `disabled` records that the project opted out of the review step, making the completion gate weaker. |
| `currentItem` | integer or null | Index of the item being worked, or `null` when idle. |
| `items` | array | Work items, in execution order. See below. |
| `blockedQuestions` | array | Open operator questions raised by blocked items. Schema defined in DL-004. |

## Work items

An item is the unit of execution and verification: one decision by default, or several when they are genuinely coupled (DL-002).

```json
{
  "index": 1,
  "decisions": [
    { "id": "DL-010", "hash": "sha256:9f2b..." },
    { "id": "DL-011", "hash": "sha256:41ac..." }
  ],
  "status": "pending",
  "acceptance": {
    "annotations": ["src/billing/vat.ts"],
    "checks": ["npm test -- src/billing"]
  },
  "attempts": 0,
  "evidence": []
}
```

| Field | Type | Meaning |
|---|---|---|
| `index` | integer | 1-based position, stable for the life of the run. Events and blocked questions reference items by index. |
| `decisions` | array | The decisions this item implements, each pinned by intent hash. |
| `status` | enum | `pending`, `implementing`, `verifying`, `accepted`, `blocked`, `skipped`, `failed`. |
| `acceptance.annotations` | array | Paths expected to carry `@decision` annotations when the item completes. May be empty at planning time. |
| `acceptance.checks` | array | Shell commands that must exit 0. Empty means the project default applies. |
| `attempts` | integer | Implementation attempts so far. One retry is allowed before an item blocks (DL-004). |
| `evidence` | array | Verification results collected during completion, appended never rewritten. |

### Item status transitions

```
pending      --> implementing  (selected by next-item)
implementing --> verifying     (agent claims done)
verifying    --> accepted      (all four completion steps passed)
verifying    --> implementing  (first failure: retry with the failure as context)
verifying    --> blocked       (second failure: operator question raised)
blocked      --> implementing  (operator answered)
blocked      --> skipped       (operator chose to move on)
any          --> failed        (unrecoverable error; treated as blocking)
```

`accepted` and `skipped` are terminal. `blocked` and `failed` stop item selection entirely — `next-item.sh` exits 2 rather than selecting past them, so a blocker cannot be silently stepped over.

## Decision pinning

Each decision in an item carries the hash it had when the item was planned. The hash covers the fields that carry intent — `title`, `supersedes`, `amends`, and the body — and excludes `status`, `references`, and `timestamp`. Accepting a decision or letting an audit refresh its references must not invalidate a planned item; rewriting what the decision says must.

`verify-hashes.sh` compares pinned hashes against the records on disk:

- **Default scope is `pending` items.** An in-flight item may legitimately refine its own proposed decisions during implementation, which `/dld-implement` explicitly allows.
- **`--all` includes in-flight items.** Use it on resume, when the run has been idle and any change is suspect.
- **Accepted and skipped items are never checked.** Their decisions have moved on.

When an item completes, `repin-item` refreshes its hashes so later checks compare against what was actually implemented. A mismatch on a pending item stops the run for replanning rather than being auto-resolved — the decision changed because a human changed it.

### Run status transitions

```
active  --> paused    (operator, or user input during an autonomous run)
active  --> blocked   (item exhausted its retry and needs an operator answer)
active  --> complete  (no pending items remain)
active  --> stopped   (operator ended the run; terminal, not resumable)
paused  --> active    (resume, after preconditions re-validate)
blocked --> active    (operator answered; item retried or skipped)
```

`complete` and `stopped` are terminal. Restart by creating a new run.

## events.jsonl

One compact JSON object per line, appended and never rewritten. Every event carries `timestamp` (UTC ISO-8601) and `type`; other fields depend on the type.

```json
{"timestamp":"2026-08-20T20:15:30Z","type":"run-created","title":"Payment gateway"}
{"timestamp":"2026-08-20T20:41:02Z","type":"item-blocked","item":2,"reason":"acceptance check failed"}
```

The log is the recovery record. When `state.json` is damaged or missing, the run is reconstructed by replaying events. Readers must tolerate unknown event types and quarantine a malformed trailing line rather than failing the whole run.

## Writing rules

- **Atomic snapshot.** `state.json` is written to a temporary file and renamed. A crash mid-write leaves the previous state intact, never a truncated document.
- **Append-only log.** Events are appended as single lines. Nothing rewrites or reorders them.
- **One writer.** A run has one active writer at a time. Concurrent runs in the same worktree are rejected by the precondition check.
- **No hand editing.** Use `run-state.sh` (bash) or the extension's state module. Direct edits break the `updatedAt` contract and can corrupt an in-flight run.

## Blocked questions

When an item exhausts its retry, the run raises an operator question rather than writing anything to the decision log. A blocker is operational, not a design choice (DL-004).

```json
{
  "item": 2,
  "reason": "acceptance check fails: 3 tests red after the retry",
  "question": "Relax the check or fix the fixture?",
  "raisedAt": "2026-08-20T20:41:02Z",
  "attempts": 2,
  "answer": null,
  "answeredAt": null,
  "resolution": null
}
```

`resolution` is `retry` or `skip` once answered. Questions are never removed — answered ones stay as the record of why the run changed course.

Blocking requires the item to have used its retry (`attempts >= 2`); `block-item.sh --force` overrides for failures retrying cannot fix.

## Scripts

| Script | Purpose |
|---|---|
| `create-run.sh` | Scaffold a run directory, write the initial state and contract, ensure the gitignore entry |
| `run-state.sh` | `get`, `set`, `set-status`, `list`, `active`, plus item operations: `add-item`, `get-item`, `set-item-status`, `add-evidence`, `bump-attempt`, `repin-item` |
| `append-event.sh` | Append one event to the log |
| `decision-hash.sh` | Compute a decision's intent hash |
| `next-item.sh` | Select the next item to work, refusing to step past a blocker |
| `verify-hashes.sh` | Detect decisions that changed since the run was planned |
| `guard-preconditions.sh` | Check that starting or resuming is safe |
| `verify-item.sh` | Run the mechanical half of the completion transaction and record evidence |
| `block-item.sh` | Block an item and raise an operator question |
| `resolve-block.sh` | Record the operator's answer and retry or skip |
