# Low-conflict decision IDs — Review and Plan (1.1)

**Status:** planned. The choices are recorded as DL-092 to DL-100 (tag `timestamp-ids`) in dld-kit's own decision log; where a decision and this document disagree, the decision wins.

## Problem

`DL-NNN` IDs are `highest + 1`. Two branches (or two agents) that each record a decision from the same base pick the same number. `/dld-reindex` repairs this after the fact (DL-026, DL-027, DL-029, DL-064, DL-065), but it costs a rename plus a rewrite of annotations and references on every clash, and the clash rate grows with the number of concurrent authors. The goal is an **opt-in alternative ID format** that is sortable, practically collision-free without coordination, and ships as a **minor release (1.1)** that leaves existing sequential logs untouched.

## Requirements

1. Collision-free in practice across unmerged branches, with no network or base-branch lookup.
2. Sorts chronologically as plain text, and mixes with legacy `DL-001`-style IDs in one log.
3. Short enough to live in every `@decision(...)` annotation and in prose.
4. The unique part is what programmatic checks use (annotations, `amends`/`supersedes`, lookups, renames). An optional human-readable slug is a label, never part of identity.
5. Sequential stays the default. Old CLIs must fail safe, not corrupt, when they meet new IDs.

## Options for the unique part

| Option | Example | Length (after `DL-`) | Sortable | Notes |
|---|---|---|---|---|
| **A. Readable time + hex** (custom) | `T20261119-142530-a3f9c1` | 23 | yes | Date visible in `ls` and annotations, but verbose. The record's `timestamp` already carries the date. Rejected. |
| **B. Compact base32 time + random** (custom, **chosen**) | `T1k3m9z2p7xq4h` | 13 | yes | `T` marker, Unix seconds in Crockford base32 (7 chars), 25 random bits (5 chars). Opaque, which is fine: the date is in the record's `timestamp`. |
| **C. ULID** | `01KABCDEFGHJKMNPQRSTVWXYZ0` | 26 | yes | Standard, libraries exist. 48-bit ms time + 80 random bits: more precision and entropy than a decision log needs. |
| **D. UUIDv7 / TypeID** | `0194…-…` / `01h…` | 32–36 / 26 | yes | Standard, but longest. UUID form is hostile in prose and annotations. |
| **E. Hash of content** (git-style short hash) | `a3f9c1d` | 7+ | no | Collision-resistant but unsortable, and the ID changes if the title is edited. Rejected. |
| **F. Sequential with per-author ranges** | `DL-A-014` | — | partly | Needs allocation state; does not remove the problem for agents. Rejected. |

**Collision math (B).** Two IDs collide only if they share the same second *and* the same 25 random bits. For two concurrent IDs created within a week of each other, that is about 1/604,800 × 1/33,554,432 ≈ 5×10⁻¹⁴ per pair. Even 4 random characters (20 bits, ≈ 2×10⁻¹² per pair) would be enough; 5 leaves margin. That figure assumes creation times are spread out. The motivating case is the opposite: several agents started together. Even if every ID of two agents lands in the same seconds, the risk is 1 in 33 million per aligned pair, so a few hundred concurrent IDs stay far below one in a million. Inside one working copy it is not probabilistic at all: `create-decision` refuses an existing ID. If a collision ever happens across branches, `find-collisions` and `/dld-reindex` still detect and repair it.

**Third-party libraries are not needed.** The CLI bundles to one zero-dependency file (PRACTICES.md); B is about 20 lines on `node:crypto`.

**Decision: B, spelled `DL-T<7 base32 time><5 base32 random>`**, e.g. `DL-T1k3m9z2p7xq4h` (16 characters with the prefix).

- Time is Unix seconds, encoded in Crockford base32 with fixed width. 7 characters cover until the year 3059, so lexical order is chronological order.
- Canonical spelling is lower case, alphabet `0123456789abcdefghjkmnpqrstvwxyz`. Upper case and the Crockford aliases (`I`/`L` → `1`, `O` → `0`) are not canonical, the same way `DL-5` is not canonical for `DL-005` (DL-078); tools reject them and `canonicalSpelling` suggests the fix.
- Pattern: `T[0-9a-hjkmnp-tv-z]{12}`. The spelling lives in one module (workstream 1).
- Reading the date back needs no tool: it is in the record's `timestamp`. A `dld` helper to decode an ID is optional, not part of the plan.

**The leading letter is deliberate.** Every `DL-\d+` match in 1.0 (annotation scan, mention scan, `RECORD_FILE`, reindex) would match the leading digits of `DL-1k3m…` as a number, and a 1.0 `next-id` would then mint a nonsense sequential ID above it. The base32 time part starts with a digit for the next several decades (`1…`), so the marker is required. With the `T` first, 1.0 tooling does not recognise the new IDs at all: records are invisible to it rather than misread. The `T` also sorts after every digit-only legacy ID in file listings (`DL-T…` after `DL-1000`).

## The optional suffix (not in 1.1)

Decided: 1.1 ships **without** a slug. A record's file name stays exactly `<id>.md`, so the path can always be built from the ID. Lookup from an annotation to its record is the most common thing agents do, and it must stay a direct file read.

Also decided, for when a slug is added later: it lives in the **file name only** (`DL-T1k3m9z2p7xq4h--retry-policy.md`) and is never part of the ID in frontmatter, annotations, `amends`, `supersedes` or mentions. Slug inside the ID was rejected: it turns a rename into a cross-file rewrite and makes the programmatic key ambiguous.

**1.1 reserves the syntax.** `--` cannot occur in either ID form, so `<id>--<text>.md` is unambiguous later. In 1.1 such a file is not a record: `create-decision` never writes one, and `/dld-audit` reports any file in the records directory named that way, so nobody starts using the form by hand before the tooling supports it.

What the later slug work has to solve, kept here so it is not rediscovered:

- Lookup by ID needs a glob or a command that prints the path, in every skill and in the always-on rule.
- Everything that matches a local record to its base-branch version must match by ID, not by file name (`integratedRecords` in `decision-edits.ts`, `collectIndexRows --include-base`, `list-proposed`). Otherwise changing a slug would make an integrated record look like a new draft and bypass `decision_edits`.
- Two records with the same ID but different slugs merge without a git conflict, so `duplicateRecordFiles` (DL-080) becomes the only signal.
- Slugs go stale when a title changes.
- A CLI from before the slug release will not see slugged records, the same skew problem as 1.0 meeting timestamp IDs.

## Configuration

```yaml
# dld.config.yaml
id_format: sequential   # default, unchanged behaviour
# id_format: timestamp  # new records get DL-T<time><random>
```

- The setting only decides how **new** IDs are minted. Both forms are always valid when read, so a repository can switch at any time and the log becomes mixed.
- Total order for sorting everywhere: sequential IDs by number, then timestamp IDs by key text. This is a convention, not strict chronology: a sequential ID can be newer than a timestamp ID (a branch in flight during the switch, or a 1.0 CLI, which ignores `id_format`). Nothing programmatic may assume ID order equals creation order.
- `/dld-init` asks which format to use; `/dld-reindex` stays for sequential mode and for branches that were in flight when the switch happened.

## Minimum version guard

Decided: 1.1 adds a guard, for this change and for later ones.

```yaml
min_dld_version: 1.1.0
```

- A CLI older than the stated version stops with a clear message naming both versions and how to upgrade, exit non-zero, before reading or writing anything. Checked in the one place every project command loads the config; `dld update`, the install commands, `--version` and `--help` stay usable so the user can upgrade.
- Optional. Without the key nothing changes. The value must be a plain `major.minor.patch`; anything else is a config error.
- Choosing `id_format: timestamp` in `dld init` / `/dld-init` writes `min_dld_version: 1.1.0` with it. `/dld-audit` notes a timestamp-mode config that lacks the key.
- It cannot stop a 1.0 CLI, which only warns about the unknown key. From 1.1 on, a repository that adopts a later format change is protected against collaborators on an older CLI.

## What the review found

Counts are from `src/` and `templates/` on `main` (1.0.0).

**The ID is treated as a number in about 20 places.** The shape is `DL-` + digits in these places, and several sort or compute by the integer:

- `src/core/records.ts`: `RECORD_FILE`, `DECISION_ID`, `DECISION_MENTION`, `recordNumber`, `duplicateRecordFiles` (groups by number).
- `src/core/ids.ts`: `formatId(n)`, `isCanonicalId`, `canonicalSpelling`, `nextId` (highest + 1).
- `src/core/annotations.ts`: the annotation, exact-match and near-miss patterns (`DL-\d+`, `/dl-\d/i`).
- `src/core/mentions.ts`: `ID`, `SUBJECT`.
- `src/core/rename.ts` (`(?![0-9])` boundary so `DL-100` does not match inside `DL-1000`), `rename-plan.ts`, `reindex.ts` (`idNumber`, `planRenames` assigns `highest + 1 + index`), `open-prs.ts`, `related.ts` (`idNumber` slices `id.slice(3)`), `decision-edits.ts`, and CLI commands `check-decision-edits`, `restore-decision-prose`, `related-decisions`, `create-decision`, `update-snapshot-state`.
- Seven modules carry a `number: number` field or sort with `recordNumber`: `decisions.ts`, `ids.ts`, `proposed.ts`, `audit.ts`, `records.ts`, `snapshot.ts`, `index-file.ts`.

**The snapshot watermark is numeric.** `.dld-state.yaml` stores `decisions_included: N`; `detectSnapshotChanges` reports records numbered above N as new, and records at or below N that appear in `git diff commit_hash..HEAD` as modified (DL-025, DL-070, DL-084). A record merged late with an ID below the watermark is therefore already caught, as *modified*, as long as the stored commit resolves. So the watermark does not break; it needs to hold an ID and compare with `compareIds`. Two existing gaps become more common with timestamp IDs and are worth closing at the same time: when the stored commit does not resolve, only the watermark is used and late merges are missed; and the diff ignores uncommitted and untracked records, which `recordsChangedSinceAudit` in `audit.ts` already handles.

**Burst ordering is a minor behaviour change.** `/dld-plan` and `/dld-retrofit` create records in a loop, calling `next-id` each time. An agent's calls are normally more than a second apart, so IDs come out in order anyway; only scripted or very fast use puts several in one second, where random suffixes would shuffle them. A cheap rule keeps order there (see workstream 3). It must not be `max(now, newest local key + 1s)` without a bound: one record with a far-future key (a wrong clock) would pin every later ID to "newest + 1s", so concurrent branches would share the time part and uniqueness would rest on the 25 random bits alone.

**`/dld-reindex` mostly goes quiet in timestamp mode.** Collisions become astronomically unlikely, but the machinery is still correct and still needed for sequential logs and for the switch window. `planRenames` must mint replacement IDs through the same generator instead of `highest + 1`. No new decision is needed to keep it.

**The skills barely change.** About 120 lines mentioning `DL-NNN`/`DL-XXX` across 11 skill templates and the rule (some 70 more in the docs and README) are placeholders in prose or examples. The real behaviour changes are `next-id` in dld-decide, dld-plan and dld-retrofit, the reindex skill's framing, the "canonical ID form" wording in dld-audit and dld-audit-auto, `/dld-init`, and `decision_range`.

**1.0 CLIs and unknown config.** An unknown `id_format` key makes a 1.0 CLI print a warning and carry on (`parseConfig` warns per unknown key). Teammates on 1.0 will not see timestamp records at all, thanks to the leading letter. That is not harmless: a 1.0 `regenerate-index` rewrites `INDEX.md` without them, `next-id` mints a sequential ID, and audits skip their annotations. Skills installed as a plugin bundle their own CLI, so version skew between collaborators is the normal case. The release note must say: upgrade everyone before switching.

## Plan

### 0. Decisions first (dogfooding)

Run `/dld-plan` for roughly these records, tagged `timestamp-ids`. This repo's own log stays sequential for now; whether it switches is postponed.

1. `id_format` config and mixed logs; ordering rule; default stays `sequential`. Amends DL-014 and DL-078.
2. ID spelling (option B), the `T` marker guard, collision reasoning, the reserved `--` suffix syntax. Amends DL-078.
3. Ordering inside a burst, with the bound on clock-ahead keys.
4. Snapshot watermark holds an ID; uncommitted records are included; full mode when the stored commit does not resolve. Amends DL-025, DL-070, DL-084.
5. Reindex renames mint IDs through the configured generator. Amends DL-027, DL-029.
6. `min_dld_version` guard in the config. Amends DL-079.

The amend targets above are a first pass. Derive the real list from the `@decision` annotations on every function the work touches; DL-018 (index order), DL-074 (annotation syntax and near-misses), DL-079 (config keys) and DL-080 (uniqueness by number) are also affected.

`decision_edits: block` is set for this repo, so each of those is an amendment record, not an edit.

### 1. ID model — `src/core/ids.ts`

- `parseId(id)` → `{ kind: "sequential", number } | { kind: "timestamp", key }`, `compareIds(a, b)`, `isCanonicalId`, `canonicalSpelling` (timestamp IDs are lower-case Crockford base32; reject other spellings the way DL-078 rejects `DL-5`).
- `generateId(ctx, format, existing)` for both formats. Add `randomBytes(n)` to `Context` (DL-008) so tests are deterministic; the real context uses `node:crypto`.
- Export the patterns once (`ID_PATTERN`, `ID_SOURCE`, and the trailing boundary: `(?![0-9])` for sequential IDs as today, `(?![0-9a-z])` for the fixed-length timestamp form) so no other module spells `DL-\d+`.

### 2. Replace "number" with a sort key

- `recordNumber` → `recordIdOf(path)` (the file name without `.md`) plus `compareIds`. Update the seven modules above.
- `findRecordFile`, `duplicateRecordFiles`, `createDecision` (duplicate check by ID), `proposed.ts` (`basename === id`), `audit.ts`, `related.ts`, `index-file.ts` (sort and row key), `snapshot.ts`.
- `RECORD_FILE` accepts `DL-<digits>.md` and `DL-T<12 base32>.md`, nothing else. A reserved-form name (`<id>--<text>.md`) is reported by the audit.

### 3. Generation and commands

- `next-id` honours `id_format` and prints one ID. Ordering inside a burst: if the newest local key is at or ahead of the clock by no more than a small bound (say 60 s), use its time + 1 s; otherwise use the clock. A local key further ahead than the bound is reported by `/dld-audit`. `create-decision` keeps `--id` (so dld-plan's flow is unchanged) and also accepts `--auto-id`, which allocates and creates under the same exclusive-create check; that removes a race when two agents share a working copy.
- `plan-renames`, `rename-decision`, `commit-reindex`: generate via the configured generator, anchor rewrites with the new boundary pattern (a key must not match inside a longer alphanumeric run).
- `find-collisions`, `list-taken-ids`: unchanged in logic; run on both forms.

### 4. Scans and text

Annotation scanner, near-miss detection (`/dl-\d/i` → also `dl-t\d`), mention scanner (`SUBJECT` for "DL-X's"), open-PR claims, `decision-edits`, `restore-decision-prose` and `related-decisions` argument validation all take their pattern from workstream 1.

### 5. Snapshot state

Store the watermark as an ID and compare with `compareIds`; keep reading the numeric `decisions_included` written by 1.0. Include uncommitted and untracked records in the changed set, the way `recordsChangedSinceAudit` does. When the stored commit does not resolve, fall back to `mode: full` instead of trusting the watermark alone. `update-snapshot-state` output ("through DL-…") formats either form.

### 6. Config, init, skills, docs

- `config.ts`: add `id_format` and `min_dld_version` to `CONFIG_KEYS` and validation, and the version check where project commands load the config; `dld init` and `/dld-init` ask the question; `docs/framework/project-configuration.md` and `decision-record-format.md` document the rule, the reserved `--` syntax and mixed ordering.
- Templates: dld-decide, dld-plan, dld-retrofit (ID-generation wording and burst note), dld-reindex (when it is still needed), dld-audit, dld-audit-auto (canonical form), dld-status, rule file; README "Teams" paragraph; `docs/workflows.md`, `docs/faq.md`; a short "switching to timestamp IDs" section in `docs/upgrading-from-0x.md` or a new `docs/id-formats.md`.
- `npm run generate`, then `npm run check:generated`.

### 7. Tests

- Unit: ID parse/compare/generate (fixed random bytes, fixed clock, same-second bursts, clock going backwards), every changed regex against both forms, `DL-100`/`DL-1000`/`DL-T…` boundary cases, base32 encode/decode round trip and fixed-width ordering, upper-case and alias spellings rejected, a reserved-form file name is ignored as a record and reported, a far-future key in the log, `min_dld_version` (older CLI refuses, `update` and `--version` still run, malformed value), mixed-log ordering in INDEX, snapshot, audit, reindex plans.
- Coverage stays ≥ 90% per file (DL-020).
- CLI integration (`tests/cli`): create a log in timestamp mode, switch an existing sequential log, two branches creating decisions concurrently and merging without a collision, snapshot after a late merge.
- Regression guard: a fixture with timestamp records run through a pattern copy of the 1.0 regexes, asserting no match.

### 8. Release

`npx changeset` minor → 1.1.0. Release notes: opt-in, default unchanged, **upgrade all collaborators before enabling**. Check `check:pack` and `check:installers` as usual.

## Sequencing

Workstreams 1 and 2 come first and everything else depends on them; 3 to 6 can then run in parallel; 7 (tests) is written alongside each workstream, and 8 closes. The largest and riskiest parts are workstream 2 (many modules change shape) and the test matrix in 7.

1.1 can ship in two PRs: (a) the ID model, key refactor and tests behind `id_format: sequential` only, which changes nothing visible and is easy to review; (b) the generator, config, snapshot change, skills and docs that turn the option on.

## Open questions

1. ~~Spelling~~ settled: option B.
2. ~~Slug~~ settled: not in 1.1; syntax reserved; when added, file name only.
3. Default for new projects: expected to become `timestamp` in 2.0; decide then.
4. ~~Minimum version guard~~ settled: `min_dld_version` ships in 1.1.
5. ~~This repo's own log~~ stays sequential for now; revisit after 1.1.
