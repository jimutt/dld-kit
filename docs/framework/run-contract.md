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
| `items` | array | Work items. Schema defined in DL-002. |
| `blockedQuestions` | array | Open operator questions raised by blocked items. Schema defined in DL-004. |

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

## Scripts

| Script | Purpose |
|---|---|
| `create-run.sh` | Scaffold a run directory, write the initial state and contract, ensure the gitignore entry |
| `run-state.sh` | `get`, `set`, `set-status`, `list`, `active` — all writes atomic |
| `append-event.sh` | Append one event to the log |
