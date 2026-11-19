# Low-conflict decision IDs — Review and Plan (1.1)

**Status:** proposal. Nothing here is decided. The choices become decisions in dld-kit's own log (via `/dld-plan`) as each workstream starts; where a decision and this document disagree, the decision wins.

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

**Collision math (B).** Two IDs collide only if they share the same second *and* the same 25 random bits. For two concurrent IDs created within a week of each other, that is about 1/604,800 × 1/33,554,432 ≈ 5×10⁻¹⁴ per pair. Even 4 random characters (20 bits, ≈ 2×10⁻¹² per pair) would be enough; 5 leaves margin. Bursts inside one process (`/dld-plan` writing several decisions in the same second) are not a probabilistic matter: `create-decision` already refuses an existing ID, and `next-id` makes IDs strictly increasing against local records (see workstream 3).

**Third-party libraries are not needed.** The CLI bundles to one zero-dependency file (PRACTICES.md); B is about 20 lines on `node:crypto`.

**Decision: B, spelled `DL-T<7 base32 time><5 base32 random>`**, e.g. `DL-T1k3m9z2p7xq4h` (16 characters with the prefix).

- Time is Unix seconds, encoded in Crockford base32 with fixed width. 7 characters cover until the year 3059, so lexical order is chronological order.
- Canonical spelling is lower case, alphabet `0123456789abcdefghjkmnpqrstvwxyz`. Upper case and the Crockford aliases (`I`/`L` → `1`, `O` → `0`) are not canonical, the same way `DL-5` is not canonical for `DL-005` (DL-078); tools reject them and `canonicalSpelling` suggests the fix.
- Pattern: `T[0-9a-hjkmnp-tv-z]{12}`. The spelling lives in one module (workstream 1).
- Reading the date back needs no tool: it is in the record's `timestamp`. A `dld` helper to decode an ID is optional, not part of the plan.

**The leading letter is deliberate.** Every `DL-\d+` match in 1.0 (annotation scan, mention scan, `RECORD_FILE`, reindex) would match the leading digits of `DL-1k3m…` as a number, and a 1.0 `next-id` would then mint a nonsense sequential ID above it. The base32 time part starts with a digit for the next several decades (`1…`), so the marker is required. With the `T` first, 1.0 tooling does not recognise the new IDs at all: records are invisible to it rather than misread. The `T` also sorts after every digit-only legacy ID in file listings (`DL-T…` after `DL-1000`).

## The optional suffix

Recommendation: the **ID is the key only** (frontmatter `id`, annotations, `amends`, `supersedes`, mentions). The slug lives in the **file name only**: `DL-T1k3m9z2p7xq4h--retry-policy.md`. Changing the slug is a plain `git mv` and never touches annotations; a typo or a reworded title cannot break references. The cost is that "file name == ID" no longer holds, so every lookup that does `basename(file, ".md") === id` goes through one `recordIdOf(path)` helper (workstream 2).

The alternative, slug inside the ID, makes annotations self-describing but turns a rename into a cross-file rewrite and makes the programmatic key ambiguous. Not recommended.

## Configuration

```yaml
# dld.config.yaml
id_format: sequential   # default, unchanged behaviour
# id_format: timestamp  # new records get DL-T<time><random>
```

- The setting only decides how **new** IDs are minted. Both forms are always valid when read, so a repository can switch at any time and the log becomes mixed.
- Total order for sorting everywhere: sequential IDs by number, then timestamp IDs by key text. (Legacy IDs are all older than any timestamp ID created after the switch.)
- `/dld-init` asks which format to use; `/dld-reindex` stays for sequential mode and for branches that were in flight when the switch happened.

## What the review found

Counts are from `src/` and `templates/` on `main` (1.0.0).

**The ID is treated as a number in about 20 places.** The shape is `DL-` + digits in these places, and several sort or compute by the integer:

- `src/core/records.ts`: `RECORD_FILE`, `DECISION_ID`, `DECISION_MENTION`, `recordNumber`, `duplicateRecordFiles` (groups by number).
- `src/core/ids.ts`: `formatId(n)`, `isCanonicalId`, `canonicalSpelling`, `nextId` (highest + 1).
- `src/core/annotations.ts`: the annotation, exact-match and near-miss patterns (`DL-\d+`, `/dl-\d/i`).
- `src/core/mentions.ts`: `ID`, `SUBJECT`.
- `src/core/rename.ts` (`(?![0-9])` boundary so `DL-100` does not match inside `DL-1000`), `rename-plan.ts`, `reindex.ts` (`idNumber`, `planRenames` assigns `highest + 1 + index`), `open-prs.ts`, `related.ts` (`idNumber` slices `id.slice(3)`), `decision-edits.ts`, and CLI commands `check-decision-edits`, `restore-decision-prose`, `related-decisions`, `create-decision`, `update-snapshot-state`.
- Seven modules carry a `number: number` field or sort with `recordNumber`: `decisions.ts`, `ids.ts`, `proposed.ts`, `audit.ts`, `records.ts`, `snapshot.ts`, `index-file.ts`.

**The snapshot watermark is numeric and does not survive this change.** `.dld-state.yaml` stores `decisions_included: N` and `detectSnapshotChanges` treats every record numbered above N as new (DL-025, DL-070, DL-084). Timestamp IDs make this wrong in a new way: a branch cut last week merges today with a key *below* the watermark and is never snapshotted. (Sequential IDs have the same weakness today, just less often.) The fix is to detect new records from git (`--diff-filter=A` over `commit_hash..HEAD`, which the modified-record path already does) and keep the number only as a read-compatible legacy field.

**Burst ordering is a real behaviour change.** `/dld-plan` and `/dld-retrofit` create many records in a loop, calling `next-id` each time. Plain random suffixes would shuffle a plan's decisions inside one second. IDs must be strictly increasing against the local log (`time = max(now, newest local key time + 1s)`), so a plan keeps its order and `decision_range` summaries ("DL-005 – DL-007") stay meaningful.

**`/dld-reindex` mostly goes quiet in timestamp mode.** Collisions become astronomically unlikely, but the machinery is still correct and still needed for sequential logs and for the switch window. `planRenames` must mint replacement IDs through the same generator instead of `highest + 1`. No new decision is needed to keep it.

**The skills barely change.** About 190 `DL-NNN`/`DL-XXX` mentions across 12 templates and the rule are placeholders in prose or examples. The real behaviour changes are `next-id` in dld-decide, dld-plan and dld-retrofit, the reindex skill's framing, the "canonical ID form" wording in dld-audit and dld-audit-auto, `/dld-init`, and `decision_range`.

**1.0 CLIs and unknown config.** An unknown `id_format` key makes a 1.0 CLI print a warning and carry on (`parseConfig` warns per unknown key). Teammates on 1.0 will not see timestamp records at all, thanks to the leading letter. The release note must say: upgrade everyone before switching.

## Plan

### 0. Decisions first (dogfooding)

Run `/dld-plan` for roughly these records, tagged `timestamp-ids`. This repo's own log stays sequential.

1. `id_format` config and mixed logs; ordering rule; default stays `sequential`. Amends DL-014 and DL-078.
2. ID spelling (option B), the `T` marker guard, collision reasoning, suffix lives in the file name only. Amends DL-078.
3. Monotonic generation inside a burst.
4. Snapshot change detection from git instead of a numeric watermark. Amends DL-025, DL-070, DL-084.
5. Reindex renames mint IDs through the configured generator. Amends DL-027, DL-029.

`decision_edits: block` is set for this repo, so each of those is an amendment record, not an edit.

### 1. ID model — `src/core/ids.ts`

- `parseId(id)` → `{ kind: "sequential", number } | { kind: "timestamp", key }`, `compareIds(a, b)`, `isCanonicalId`, `canonicalSpelling` (timestamp IDs are lower-case Crockford base32; reject other spellings the way DL-078 rejects `DL-5`).
- `generateId(ctx, format, existing)` for both formats. Add `randomBytes(n)` to `Context` (DL-008) so tests are deterministic; the real context uses `node:crypto`.
- Export the patterns once (`ID_PATTERN`, `ID_SOURCE`, a `(?![\w-])`-style boundary) so no other module spells `DL-\d+`.

### 2. Replace "number" with a sort key

- `recordNumber` → `recordIdOf(path)` (strips the optional `--slug`) plus `compareIds`. Update the seven modules above.
- `findRecordFile`, `duplicateRecordFiles`, `createDecision` (duplicate check by ID), `proposed.ts` (`basename === id`), `audit.ts`, `related.ts`, `index-file.ts` (sort and row key), `snapshot.ts`.
- `RECORD_FILE` accepts `DL-<digits>.md` and `DL-T…(--slug)?.md`. Add `--slug <text>` to `create-decision`, validated as `[a-z0-9]+(-[a-z0-9]+)*`.

### 3. Generation and commands

- `next-id` honours `id_format`, is monotonic against local records, prints one ID. `create-decision` keeps `--id` (so dld-plan's flow is unchanged) and also accepts `--auto-id`, which allocates and creates under the same exclusive-create check; that removes a race when two agents share a working copy.
- `plan-renames`, `rename-decision`, `commit-reindex`: generate via the configured generator, anchor rewrites with the new boundary pattern (`DL-T…-a3f9c1` must not match inside a longer key or a `--slug`).
- `find-collisions`, `list-taken-ids`: unchanged in logic; run on both forms.

### 4. Scans and text

Annotation scanner, near-miss detection (`/dl-\d/i` → also `dl-t\d`), mention scanner (`SUBJECT` for "DL-X's"), open-PR claims, `decision-edits`, `restore-decision-prose` and `related-decisions` argument validation all take their pattern from workstream 1.

### 5. Snapshot state

Compute new decisions from the git range (records added since `commit_hash`), keep `includes_proposed`, read an old numeric `decisions_included` for logs that predate 1.1, and write a ID-valued field (highest ID by `compareIds`) for display only. `update-snapshot-state` output ("through DL-…") formats the new form.

### 6. Config, init, skills, docs

- `config.ts`: add `id_format` to `CONFIG_KEYS` and validation; `dld init` and `/dld-init` ask the question; `docs/framework/project-configuration.md` and `decision-record-format.md` document the rule, the slug and mixed ordering.
- Templates: dld-decide, dld-plan, dld-retrofit (ID-generation wording and burst note), dld-reindex (when it is still needed), dld-audit, dld-audit-auto (canonical form), dld-status, rule file; README "Teams" paragraph; `docs/workflows.md`, `docs/faq.md`; a short "switching to timestamp IDs" section in `docs/upgrading-from-0x.md` or a new `docs/id-formats.md`.
- `npm run generate`, then `npm run check:generated`.

### 7. Tests (M, largest share)

- Unit: ID parse/compare/generate (fixed random bytes, fixed clock, same-second bursts, clock going backwards), every changed regex against both forms, `DL-100`/`DL-1000`/`DL-T…` boundary cases, base32 encode/decode round trip and fixed-width ordering, upper-case and alias spellings rejected, slug handling, mixed-log ordering in INDEX, snapshot, audit, reindex plans.
- Coverage stays ≥ 90% per file (DL-020).
- CLI integration (`tests/cli`): create a log in timestamp mode, switch an existing sequential log, two branches creating decisions concurrently and merging without a collision, snapshot after a late merge.
- Regression guard: a fixture with timestamp records run through a pattern copy of the 1.0 regexes, asserting no match.

### 8. Release

`npx changeset` minor → 1.1.0. Release notes: opt-in, default unchanged, **upgrade all collaborators before enabling**. Check `check:pack` and `check:installers` as usual.

## Sequencing

Workstreams 1 and 2 come first and everything else depends on them; 3 to 6 can then run in parallel; 7 (tests) is written alongside each workstream, and 8 closes. The largest and riskiest parts are workstream 2 (many modules change shape), workstream 5 (a behaviour change, not a refactor) and the test matrix in 7.

1.1 can ship in two PRs: (a) the ID model, key refactor and tests behind `id_format: sequential` only, which changes nothing visible and is easy to review; (b) the generator, config, snapshot change, skills and docs that turn the option on.

## Open questions

1. ~~Spelling~~ settled: option B.
2. Slug in the file name only (recommended), or part of the ID?
3. Should `id_format: timestamp` become the default for new projects in 2.0?
4. Should `dld` refuse to run on a log whose config names a newer feature than the CLI supports (a `min_dld_version` key)? It would close the 1.0 warn-and-continue gap for future changes, but is a separate feature.
