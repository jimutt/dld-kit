# `dld-search` skill — design and evaluation

Date: 2026-05-03
Test corpus: `~/dev/gillerkvitter` — 162 decisions across 5 namespaces (backend 63, web 59, field-station 16, field-sync 16, birdnet 8). Real production DLD project.

## Background

Some DLD-using projects are approaching ~200 decisions. The user wanted to evaluate adding a retrieval layer beyond standard agent grep. Up-front research (see same-day session) concluded: at this scale, embedding-heavy semantic search is over-engineering — Cursor / Claude Code / Aider have all converged on agentic-grep as the primary pattern, with reranking/embeddings as optional assists for very large corpora. The user agreed to skip the FTS5 / vector-search path for now.

The remaining question: can we get a meaningful win from a **methodology skill** that wraps the existing grep-based retrieval, runs on a cheap fast model (Haiku 4.5), and encodes a search playbook? Specifically, one designed to be invoked by `dld-plan` and `dld-implement` so they reliably surface prior decisions before planning or coding.

## Skill design

`SKILL.md` lives at `.claude/skills/dld-search/SKILL.md` (Claude Code variant) and `skills/dld-search/SKILL.md` (tessl variant per the dual-directory convention).

### Frontmatter (Claude Code variant)

```yaml
name: dld-search
description: Find decisions relevant to a query, feature, or code path. Returns a ranked,
  structured list (IDs + titles + one-line relevance) — does NOT dump file contents.
  Designed to be invoked by other DLD skills (especially `dld-plan` and `dld-implement`)…
user_invocable: true
model: claude-haiku-4-5-20251001
effort: low
context: fork
agent: Explore
```

The Claude-Code-specific fields encode the cost/isolation profile:

- `model: claude-haiku-4-5-20251001` — Haiku for speed and cost
- `effort: low` — search is mostly mechanical
- `context: fork` — runs in an isolated subagent so the parent's conversation isn't polluted with grep noise
- `agent: Explore` — read-only tools, optimised for codebase exploration

The tessl variant uses only spec-compliant fields (`name`, `description`, `compatibility: Requires ripgrep (rg) on PATH.`) since `model`/`effort`/`context`/`agent` are Claude-Code extensions outside the agentskills.io spec.

### Playbook structure

The skill defines three modes:

- `mode:plan <feature description>` — wide net, recall over precision
- `mode:implement DL-NNN [extra context]` — narrow scope, supersedes/amends chain mandatory
- `mode:lookup <query>` — default, balanced

And a 5-step playbook:

1. **Cheap exact-match filters first** — ID match, path filter (`paths=` hint), tag filter (`tags=` hint). If a small pool falls out, skip ahead.
2. **INDEX.md as cheatsheet** — the denormalised table of all decisions; metadata-only ranking before opening files.
3. **Targeted ripgrep** with `-l` (file list only) — never `-C/-A/-B` in the candidate-discovery phase.
4. **Rank and trim** — read frontmatter + `## Decision` paragraph for top candidates only. Status filtering (drop superseded/rejected unless asked).
5. **Sanity-check before returning** — if 0 hits, retry with most distinctive term; if >50, trim and note in output.

Output is a strict structured block (markdown table) optimised for LLM consumption but human-readable.

## Test methodology

All tests run in a worktree of `~/dev/gillerkvitter` (clean, real corpus). Sessions launched via `claude -p --output-format stream-json --verbose --no-session-persistence --dangerously-skip-permissions`. Stream-JSON enables ground-truth tool/skill invocation logging — earlier `--output-format json` runs in this evaluation gave only the final result with no tool trace, which led to one false inference (later corrected).

Two paired conditions per test: **with-skill** (`dld-search` installed at `.claude/skills/dld-search/`) and **without-skill** (skill removed). For Part 2, separate worktrees so the runs could execute in parallel without colliding on file mutations.

The model in the parent session is the user's default (Sonnet/Opus class) in both conditions; `dld-search` internally forks to Haiku.

## Part 1 — Direct skill calls (4 prompts × 2 conditions)

Realistic developer prompts; agent free to invoke `dld-search` or not based on the skill's description alone.

### Tool/cost trace

| Prompt | Condition | Skill invs | Bash | Read | Grep | Glob | Turns | Duration | Cost |
|---|---|---|---|---|---|---|---|---|---|
| P1 | with    | 1 (`dld-search`) | 3 | 19 | 0 | 0 | 2 | 60s | $0.18 |
| P1 | without | 1 (`tessl__dld-lookup`) | 3 | 0  | 2 | 1 | 9 | 37s | $0.22 |
| P2 | with    | 2 (`tessl__dld-lookup` then `dld-search`) | 12 | 15 | 0 | 0 | 7 | 103s | $0.34 |
| P2 | without | 0 | 3 | 3 | 0 | 0 | 7 | 29s | $0.16 |
| P3 | with    | 1 (`dld-search`) | 6 | 8 | 0 | 0 | 2 | 48s | $0.12 |
| P3 | without | 0 | 6 | 14 | 3 | 0 | 3 | 68s | $0.47 |
| P4 | with    | 1 (`dld-search`) | 4 | 12 | 0 | 0 | 2 | 35s | $0.12 |
| P4 | without | 1 (`tessl__dld-lookup`) | 2 | 0  | 4 | 0 | 9 | 40s | $0.22 |

**Important context: the without-skill baseline already had `tessl__dld-lookup` available** (the existing tessl-installed lookup skill). It was reached for in 2 of 4 prompts. So `dld-search` competes with `tessl__dld-lookup`, not bare grep — both add value over raw search but the lookup skill is keyword/ID/path-oriented while `dld-search` is methodology-oriented.

### Decision IDs surfaced

| Prompt | with-skill (n) | without-skill (n) | Overlap |
|---|---|---|---|
| P1 (audio playback in matrix)  | 15 | 10 | 7 |
| P2 (implement DL-147)          | 8  | 4  | 4 |
| P3 (idempotency / dedup)       | 8  | 3  | 3 |
| P4 (audio enhancement pipeline)| 12 | 13 | 12 |

### What the with-skill condition actually does

In every case where with-skill invoked `dld-search`, the parent then **followed up with substantial Read activity** (8–19 reads). So delegation isn't a hard handoff — the parent uses the skill as a curated seed list and then opens individual files itself. The hoped-for "fewer parent tool calls" benefit didn't materialise: the parent does *more* Reads (it has more known-relevant candidates to open), not fewer.

### Sample outputs (P3 — "How does this codebase prevent duplicate work?")

**with-skill** (after invoking `dld-search` with args `idempotency, deduplication, preventing duplicate work, dedup, unique constraints, retry safety`):

```
Idempotency in this codebase is built around three coupled decisions added 2026-04-17
after a 31× duplication incident:

- DL-156 (field-sync) — sync agent attaches a per-row externalId idempotency key
- DL-157 (backend) — external_id unique column + ON CONFLICT DO NOTHING
- DL-158 (backend) — alerts and clip pulls fire only for newly-inserted rows

Supporting context:
- DL-027 — original push retry mechanism (the reason idempotency was needed); amended by DL-156
- DL-022 — original batch ingest endpoint; amended by DL-157
- DL-068 (alerts) and DL-105 (clip pull) — both amended by DL-158
- DL-078 — per-species trigger interval, a related dedup pattern in the alert engine

Run /dld-lookup DL-156 (or 157/158) to read any of them in full.
```

**without-skill** (no skill invocation, did its own grep + read):

```
Three decisions cover this end-to-end:

- DL-156 — Per-row idempotency key externalId = "<unix_ts>-<sqlite_id>", generated by
  field-sync, station-scoped, survives BirdNET DB rebuilds.
- DL-157 — Backend dedup via partial unique index on (station_id, external_id) +
  ON CONFLICT DO NOTHING. Retried pushes are silent no-ops.
- DL-158 — Side effects (alerts, clip pull) fire only for newly inserted rows;
  response returns { inserted, duplicates }.

Implementation pointers:
- Key generation: apps/field-sync/src/detection-reader.ts:62
- Unique index: apps/backend/migrations/015_detection_external_id.sql:5
- ON CONFLICT insert: apps/backend/src/components/detection/internal/detection.repository.ts:105
- Side-effects gated on inserted rows: apps/backend/src/components/detection/detection.controller.ts:102
- Clip pull skip-if-fetched: apps/backend/src/components/audio/internal/clip-pull.ts:29
- Alert per-species cooldown: apps/backend/src/components/notification/internal/notification.repository.ts:48
```

The without-skill version is **arguably more useful** — same core 3 decisions, plus line-numbered implementation pointers across 6 files. The with-skill version surfaced 5 extra related decisions (DL-022, DL-027, DL-068, DL-078, DL-105) that the user didn't ask about and probably didn't need.

### Sample outputs (P1 — "What decisions should I be aware of for per-cell audio playback?")

Both conditions surfaced the core matrix decisions and audio-playback decisions. Both correctly flagged the conflict with the existing cell-click drill-down (DL-053). Differences are subtle:

- **with-skill** surfaced **DL-049** (the canonical detail-page audio player) and **DL-050** (Tailscale, not WireGuard — corrected stale CLAUDE.md mention)
- **without-skill** surfaced **DL-064** (a superseded matrix decision) and **DL-123** (admin enhance trigger pattern)
- Both flagged the cell-click conflict; both flagged the "which clip plays" question

This is a wash. Both reached the right conclusions through different paths.

### Part 1 verdict

The skill **is** auto-invoked by the description alone in 3 of 4 prompts (P2 was a known-DL-NNN lookup where the parent correctly chose `tessl__dld-lookup` first instead). Output quality is **comparable, not clearly better** than baseline. Cost is comparable. Wall-clock is mixed (faster on P3 & P1, slower on P2 & P4). The clearest finding is that **the without-skill baseline is already strong** because `tessl__dld-lookup` exists and Sonnet+grep handles small markdown corpora well.

The skill's output discipline (compact structured table, explicit "why relevant") is a real qualitative advantage, but the parent agent always re-summarises in its own voice for the user, so the structure mostly benefits intermediate consumption — i.e. the planning/implementing skill use case in Part 2.

## Part 2 — Skill orchestration via `/dld-plan` and `/dld-implement`

### Critical mid-test finding

The **first** Part 2 attempt was uninformative: with-skill `/dld-plan` did **not** invoke `dld-search`. Both runs reached for `tessl__dld-plan` (the existing planner skill), which then did its own grep/Read. The two plans differed only in non-deterministic sampling — same tools, same paths.

This proved that **auto-invocation from skill descriptions alone is unreliable for inter-skill calls**. To test the actual integration, we had to wire `dld-search` into `dld-plan` and `dld-implement` explicitly.

### Wiring change

Patched the "Check for related existing decisions" section in `dld-plan/SKILL.md` and the "Understand the decision(s)" section in `dld-implement/SKILL.md` (both Claude Code and tessl variants in dld-kit, plus the `tessl__dld-plan`/`tessl__dld-implement` copies in the gillerkvitter test repo).

Pattern:

> **Preferred:** invoke the `dld-search` skill in `mode:plan` (or `mode:implement`), passing rich context.
>
> **Fallback** (when `dld-search` is not installed): scan decision files directly using grep/Read.

This makes the call explicit while keeping the skill optional.

### `/dld-plan` rerun (post-wiring)

| Condition | dld-search calls | Bash | Read | Grep | Turns | Duration | Cost |
|---|---|---|---|---|---|---|---|
| with    | 2 (both `mode:plan` with rich args) | 18 | 35 | 4 | 35 | 212s | $1.29 |
| without | 0 | 17 | 11 | 0 | 35 | 146s | $1.25 |

The with-skill run **did** invoke `dld-search` twice — once with full context including code paths and likely tags, once apparently retried. The actual args passed:

```
mode:plan Per-cell audio playback in homepage activity matrix. Each cell currently
aggregates detections for one species in one hour and links to a filtered observations
list. Want users to play a representative clip (highest-confidence detection) directly
from the cell. Touches: web frontend homepage activity matrix component, audio playback
UI, backend API serving audio clips, detection clip URL/metadata. Possibly related tags:
activity-matrix, homepage, audio, audio-playback, detection-clip, clip-export,
clip-serving, detection-audio
```

That's exactly the rich-context pattern the playbook prescribes. Wiring works.

### Resulting plans (post-wiring)

Both runs produced 3–4 well-structured proposed decisions, both correctly:

- Concluded **no backend decision needed** (existing endpoint sufficient)
- Reused `fetchAndNormalize` / DL-159 hipass parity
- Preserved DL-053/DL-143 drill-down semantics

**with-skill (3 decisions):**
| ID | Title |
|---|---|
| DL-161 | Pick highest-confidence detection as cell's representative clip |
| DL-162 | Single global cell-audio player reusing normalization and hipass pipeline |
| DL-163 | Per-cell play icon with cell-body drill-down preserved |

**without-skill (4 decisions):**
| ID | Title |
|---|---|
| DL-161 | Pick highest-confidence detection with clip as cell representative |
| DL-162 | Composite cell with corner play button overlay |
| DL-163 | Shared single-instance HTMLAudioElement for matrix cell playback |
| DL-164 | Amend DL-053 — matrix cell becomes composite, not a single anchor |

The without-skill plan is arguably **more explicit** — it carved out a separate amendment decision for DL-053. The with-skill plan is more concise, capturing the amendment in notes. Both are reasonable. **Quality is comparable.**

Cost premium for with-skill: ~$0.04 (3%). Wall-clock premium: ~66 seconds (45%).

### `/dld-implement DL-161` (chained from plan output)

| Condition | dld-search calls | Bash | Read | Grep | Edit/Write | Turns | Duration | Cost |
|---|---|---|---|---|---|---|---|---|
| with    | 1 (`mode:implement` with rich args) | 19 | 34 | 3 | 5 | 31 | 217s | $1.47 |
| without | 0 | 10 | 17 | 0 | 4 | 31 | 155s | $1.32 |

The with-skill `/dld-implement` invoked `dld-search` once with the prescribed `mode:implement DL-161 — implementing "pick highest-confidence representative detection per matrix cell". Touches apps/web/src/lib/components/ActivityMatrix.svelte and the Detection grouping client-side. Related: DL-045 (matrix), DL-053/DL-143 (drill-down), DL-108 (clip variant), DL-139 (polling). …`

Both implementations:
- Modified `apps/web/src/components/ActivityMatrix.svelte` to extend client-side grouping with representative-detection tracking
- Annotated with `@decision(DL-161)`
- Updated `decisions/INDEX.md` and the DL-161 record's `references`
- Correctly noted that template wiring is deferred to DL-162/DL-163

The with-skill version refined the tiebreak rule during implementation (earliest detectedAt, for cross-poll stability) and aligned eligibility wording to the actual `Detection` shape. The without-skill version independently picked a different tiebreak (latest detectedAt). Both reasonable; both updated their respective DL-161 record inline (the "small refinement" pattern from the implement playbook).

Cost premium for with-skill: ~$0.15 (11%). Wall-clock premium: ~62 seconds (40%).

## Findings

### What works

1. **The skill auto-invokes reliably from its description for direct user queries.** P1, P3, P4 all triggered it without prompting. The description format ("designed to be invoked by other DLD skills…") is matched by Claude appropriately.

2. **The wiring pattern works for inter-skill calls.** Once `dld-plan` and `dld-implement` explicitly mention `/dld-search` in their playbooks, they invoke it consistently with rich context (full feature description, code paths, candidate tags). Auto-invocation from description alone is **not reliable** between skills.

3. **`context: fork` + Haiku does isolate the search work** — the search subagent's tool calls don't appear in the parent's tool count. But this doesn't translate into fewer parent tool calls overall, because the parent re-reads candidates regardless.

4. **The mode arg system carries through correctly.** Callers used `mode:plan` and `mode:implement` as prescribed.

### What doesn't materialise

1. **No clear quality win at this corpus size.** On 162 decisions across 5 namespaces, the without-skill baseline (Sonnet/Opus + `tessl__dld-lookup` + grep) is already very capable. Outputs differ in detail and ordering, not in correctness.

2. **No cost or latency win.** Wall-clock is consistently slower with the skill (~40% on Part 2), cost is slightly higher (3–11%). The fork+Haiku overhead exceeds whatever the parent saves on its own reasoning at this scale.

3. **No "fewer parent context" win.** The parent does more Read calls in the with-skill condition, not fewer — it treats the skill output as a curated seed list, not a final answer.

4. **The structured-output discipline mostly benefits the inter-skill case.** Direct human users get the parent's re-summarisation either way.

### Honest conclusions

For a corpus of ~162 decisions, **`dld-search` is not delivering a measurable improvement on real workflows** beyond the existing `tessl__dld-lookup` + grep baseline. Quality, cost, and latency are all approximately a wash, with cost/latency slightly worse with the skill.

The skill **is** technically sound:
- Wiring works
- Modes work
- Output discipline is correct
- Auto-invocation works for direct queries

But the **value proposition isn't there yet** at this scale. Every original argument for a retrieval layer (the up-front research and discussion) was for *much larger* corpora where unaided grep starts to fail. At 162 decisions, the failure mode hasn't appeared.

## Recommendations

1. **Do not ship `dld-search` as a default DLD skill** at this point. The cost/complexity addition isn't justified by measurable benefit on real corpora at this scale.

2. **Keep the skill files in dld-kit but mark them experimental.** They're well-designed and the methodology is correct; they may pay off at larger scales (500+ decisions) or in projects where the user reports retrieval failures with the current setup.

3. **Revert the `dld-plan` and `dld-implement` wiring edits**. They reference `dld-search` as the preferred path, which would degrade UX for users who don't have the skill installed (the fallback works but adds prompt clutter).

4. **Re-evaluate when concrete drift appears.** If a project hits 300+ decisions and users start reporting that `/dld-plan` misses obvious prior decisions, that's the trigger to re-test the wiring with real failure cases as the test set.

5. **If `dld-search` is kept**, consider **tightening its description** so it's only auto-invoked when the query is genuinely conceptual ("what have we decided about X" framings), not for direct ID lookups where `tessl__dld-lookup` is already the right tool. This would reduce the cases where it competes uselessly with the lookup skill.

## Appendix — Test artefacts

Streams and responses preserved at `/tmp/dld-search-tests/`:
- `with-p{1..4}.stream.jsonl`, `without-p{1..4}.stream.jsonl` — Part 1
- `with-plan.stream.jsonl`, `without-plan.stream.jsonl` — Part 2 first attempt (pre-wiring; uninformative)
- `with-plan2.stream.jsonl`, `without-plan2.stream.jsonl` — Part 2 with wiring
- `with-impl1.stream.jsonl`, `without-impl1.stream.jsonl` — Part 2 implement chain
- `results/*.txt` — extracted final responses

Worktrees: `/tmp/gillerkvitter-test`, `/tmp/gillerkvitter-test2` (both with mutated decision logs from the test runs — discard).
