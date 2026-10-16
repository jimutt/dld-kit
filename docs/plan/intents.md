# Intents add-on — Plan

**Status:** design plan, nothing built yet. This document records the direction agreed in the October 2026 brainstorm. The individual choices get recorded as decisions in dld-kit's own decision log when the work starts; where a decision and this document disagree, the decision wins.

## Goal

DLD covers the development phase: a decision exists, in `proposed` state, for a specific codebase. In larger projects and companies a lot happens before that point. PMs, designers and engineers refine an idea until it is clear what to build, and the result often turns into decisions in several repos.

The intents add-on covers that phase with one new entity, the **intent**: a looser, idea-stage record of a problem worth solving and the bet placed on it. An intent turns into one or more decisions, in one or more repos.

## Principles

1. **An opt-in add-on.** DLD stays slim and decision-oriented by default. A project that does not select the add-on gets no intent skills, no intent rule text, no intent config and no intent mentions in the DLD skills. The add-on's only footprint in DLD is a documented optional frontmatter field and the install selection.
2. **Markdown in git.** Intents are plain files reviewed through PRs. Agents do the writing for people who do not live in git. Connectors to other tools are deferred (see [Deferred](#deferred)).
3. **Only the decision stores the link.** A decision lists the intents it serves; an intent never lists its decisions. "Which decisions realize this intent" is always computed by scanning, the way SNAPSHOT.md is derived. Creating a decision never writes to another repo.
4. **A decision stands on its own.** Together with the other decisions it relates to, a decision must make sense without access to its intent. The decision restates the part of the why it relies on; the intent link records provenance and gives deeper context to whoever has access.
5. **Computed, not stored.** Statuses such as "in delivery" or "shipped" are derived by trace and never written to the intent.

## The intent record

### Location

An **intent home** holds intents:

```
intents.config.yaml
intents/
  INDEX.md                 # generated
  records/
    INT-K7Q2M9X.md
```

In a multi-repo setup the home is a dedicated repo (a product or architecture repo). A single-repo project can keep the home in the code repo, next to `decisions/`. An intent has exactly one home and is never copied into code repos.

### IDs

`INT-` followed by 7 characters of Crockford base32 (`0-9 A-Z` without `I L O U`), generated randomly: `INT-K7Q2M9X`.

- An intent gets its ID at creation and keeps it forever. It can be pasted into Slack, a ticket or a meeting note on day one; nothing is ever renamed, so there is no reindex for intents.
- `next-id` rejects an ID already used on the home's base branch or in the working tree, and a CI check fails on duplicates. At 7 characters (about 34 billion values) both are safety nets.
- The ID is unique without a qualifier. A reference may still name the home (`acme:INT-K7Q2M9X`) to say where to look it up.
- Filenames are the ID only, so a title change never renames a file. `INDEX.md` is for browsing.
- Ordering comes from `timestamp`, not from the ID.

Decision IDs are unchanged. Decision references stay within a repo, where `dld-reindex` can rewrite them; intent references leave git early, which is why intents need IDs that never change.

### Frontmatter

```yaml
---
id: INT-K7Q2M9X
title: "Self-serve refunds for annual plans"
timestamp: 2026-10-16T09:12:00Z
status: ready               # shaping | ready | closed
ready_at: 2026-10-28T14:02:00Z   # set by set-status ready
resolution:                 # only when closed: done | partial | dropped | superseded
owner: anna                 # one person, free text
repos: [billing-api, web-app]    # expected target repos; a hint for trace, not a contract
supersedes: []              # intents this one replaces
tags: [refunds]
---
```

No priority, estimate, assignee, due date, decision list or link list. Links to designs and documents go in the prose.

### Prose

```markdown
## Problem
Annual-plan customers who cancel in the first 30 days must email support for a
pro-rated refund. ~140 tickets/month, median resolution 3 days.

## Outcome
A customer can request and receive a pro-rated refund for an annual plan within
30 days of purchase without contacting support. Support refund tickets for this
case drop under 20/month.

## Non-goals and constraints
- Not in scope: monthly plans, partial-seat refunds, refunds after 30 days.
- Must respect existing tax handling on credit notes.

## Options considered
- Refund as account credit only: rejected; finance requires refunds to the original method.

## Open questions
- [x] Refund to the original payment method only? Yes (Finance, erik, 2026-10-20).
- [ ] Show refund history on the account page? (deferred)

## Changes since ready
- 2026-11-03 · anna · **Outcome**: target "near zero" → "under 20/month". Finance data showed some refunds still need manual review.
```

Problem and Outcome are required. The Outcome must be observable: it is what close is judged against, and it keeps an intent from turning into a feature list. Solution detail belongs in decisions.

### Lifecycle

```
shaping ──► ready ──► closed (done | partial | dropped | superseded)
   ▲          │
   └──────────┘  reopen when real uncertainty returns
shaping ─────────────► closed (dropped)
```

- **shaping**: freely editable.
- **ready**: Problem and Outcome are settled and every open question is answered or marked deferred. `set-status ready` checks this and writes `ready_at`. The PR that flips the status is the sign-off.
- **closed**: `intent-close` runs trace, the owner judges the result against the Outcome, and a `## Resolution` section is appended. `partial` is a normal way to close; a remaining part that still matters becomes a new intent.

### Edits after ready

Intents stay editable after `ready`, but every change is visible:

1. The prose is edited in place, so the file always reads as the current intent.
2. Every edit to an intent that is `ready` or `closed` on the base branch adds a dated entry to `## Changes since ready`, naming the section, the author and the reason. `check-edits` fails when such an intent's prose changed without a new entry; `intent-shape` writes the entry, so nobody has to remember.
3. An edited section's heading gets a marker with the latest change date: `## Outcome *(changed 2026-11-03)*`.
4. `diff --since-ready` shows the full text diff from git against the version at `ready_at`.
5. Trace flags decisions made before a change (see [Trace](#trace)).

Clarifications, a tightened target or an added constraint are edits. When the Problem or Outcome becomes a different one, `intent-shape` suggests a new intent that supersedes this one.

## Linking decisions to intents

A decision lists the intents it serves in an optional frontmatter field:

```yaml
---
id: DL-231
title: "Pro-rated refund calculation for annual plans"
status: proposed
intents: [INT-K7Q2M9X]
tags: [annual-refunds]
references:
  - path: src/refunds/prorate.ts
---

## Context
Customers on annual plans may get a pro-rated refund within 30 days of purchase
without contacting support. Refunds go to the original payment method only...
```

DLD treats `intents` as opaque. It is frontmatter, so DLD's edit rules already allow adding it to a decision on the base branch later. The add-on CLI writes the field (with the shared record code), so DLD's own commands and skills need no intent-specific options.

## Reaching other repos

The home and code repos refer to each other by name. Each name resolves to a place to read from, in this order:

1. **A local path** from `dld.local.yaml`, a gitignored per-checkout file for each developer.
2. **A git submodule** path, when the config names one and it is initialized.
3. **The git URL**, fetched into a user cache (a partial clone of the decision or intent directories).

Whatever the source, the add-on reads the configured **base branch** after a fetch (`git show origin/<base>:<path>`), never the working tree or a submodule's pinned commit. A repo it cannot reach is reported as `unknown`, never as done.

```yaml
# intents.config.yaml, in the intent home
key: acme
intents_dir: intents
repos:                      # code repos trace reads
  - name: billing-api
    url: git@github.com:acme/billing-api.git
    base: main
  - name: web-app
    url: git@github.com:acme/web-app.git
    base: main
```

```yaml
# dld.config.yaml, in a code repo that selected the add-on
addons: [intents]
intents:
  home:
    name: product
    url: git@github.com:acme/product.git
    base: main
    submodule: product      # optional
```

```yaml
# dld.local.yaml, gitignored; `intent-init` adds it to .gitignore
paths:
  product: ../product
  billing-api: ../billing-api
```

In a single-repo project the home is the repo itself and none of this is needed.

## Skills

Installed only when the add-on is selected.

- **intent-init**: set up an intent home, or point a code repo at one; writes the config and the gitignore entry, installs the add-on rule.
- **intent-shape**: create an intent or refine one through an interview (Problem → Outcome → non-goals → options → open questions); flags overlapping intents; promotes to `ready`. After `ready` it records edits in the changelog and heading markers.
- **intent-handoff**: run in a code repo with a `ready` intent. Seeds `/dld-plan` (or `/dld-decide`) with the intent, makes each decision restate the why it relies on, then links the created decisions to the intent.
- **intent-trace**: report on one intent or all of them (see [Trace](#trace)).
- **intent-close**: run trace, judge the result against the Outcome with the owner, set the resolution and append the Resolution section.

The add-on also installs its own always-on rule file: decisions that list intents stand on their own; read an intent with the add-on when you need its product context; edits to ready intents go through `intent-shape`.

## CLI

The add-on's commands live in their own module, are bundled separately from `dld.mjs` and are copied into the add-on's shared skill directory, so DLD's bundle does not grow.

| Command | What it does |
|---|---|
| `next-id` | A new unused random ID |
| `create` | Write a new intent from a title, owner, repos and body |
| `show INT-…` | Print an intent from the home's base branch |
| `set-status INT-… <status> [--resolution …]` | Change status; validates `ready` and writes `ready_at` |
| `link DL-… INT-…` | Add an intent to a decision's `intents` field |
| `check-edits` | Fail on prose changes to ready or closed intents without a changelog entry |
| `diff INT-… --since-ready` | Text diff against the version at `ready_at` |
| `trace [INT-…] [--json] [--stale-days N]` | Linked decisions per repo and drift flags |
| `check-ids` | Fail on duplicate intent IDs |
| `regenerate-index` | Rebuild `intents/INDEX.md` |

Reused from `src/core`: frontmatter parsing and in-place edits, atomic writes, the injected context, base-branch resolution, INDEX rendering, and the template generator and harness adapters.

## Trace

For each repo in the intent's `repos` (and any other configured repo whose decisions cite it), trace reads the base branch and reports:

- the decisions that list the intent, with their status;
- **unknown** for repos it could not reach;
- **intent changed after decision**: a decision whose `timestamp` predates a changelog entry;
- **reversal**: a later decision that supersedes or amends a linked decision without listing the intent itself, so the intent's owner can check the bet still holds;
- **stale**: `ready` with no decisions after N days, or `shaping` untouched for N days;
- a derived state (`ready`, `in delivery`, `all decisions accepted`) that is shown, never stored.

```
INT-K7Q2M9X  Self-serve refunds for annual plans   [ready, 47d]
  billing-api  DL-231  accepted   Pro-rated refund calculation
  billing-api  DL-232  accepted   Refund to original payment method only
  web-app      DL-088  proposed   Refund request flow in account settings
  ⚠ DL-231 predates the Outcome change on 2026-11-03
  ⚠ billing-api DL-240 supersedes DL-232 and does not list this intent
  derived: in delivery
```

## Changes to DLD

All passive; a project without the add-on sees no difference.

- Document `intents` as an optional decision frontmatter field reserved for the add-on.
- Add-on selection in `dld init` and `dld update` (recorded as `addons:` in `dld.config.yaml`), so update installs and keeps the add-on's skills and rule only when selected.
- Nothing in the DLD skills or the DLD rule mentions intents.

## Phases

1. **Convention trial (no code).** Write a few intents by hand in a work setting, add `intents:` to the decisions that come out of them by hand, and use `git grep INT-` as the trace. Check that PMs write Problem and Outcome, that decisions restate the why, and that the PR step is acceptable.
2. **Format and shaping.** Add-on selection in init and update, `intent-init`, `intent-shape`, and `next-id`, `create`, `show`, `set-status`, `check-edits`, `check-ids`, `regenerate-index`.
3. **Handoff.** `intent-handoff` and `link`, with repo resolution (local path, submodule, URL).
4. **Trace and close.** `intent-trace`, `intent-close`, `trace` and `diff --since-ready`, including a JSON output for a scheduled CI job in the home.

If the trial or phase 2 does not earn its keep, stop there.

## Deferred

- **Connectors.** When they come, git stays the only source of truth and the agent's MCP connectors do the vendor work, so the toolkit holds no vendor API code. An intent would gain a `mirrors:` frontmatter field, and the CLI `render` and `apply` commands that convert to and from a tool's format. Edits made in another tool come back as a PR, with changelog entries once the intent is ready. Notes per tool:
  - **Notion**: a shaping surface, two-way through PRs; intents as a database with status, owner and repos as properties.
  - **Linear**: push only; an intent maps to a Project or an Initiative; Linear's project state is never mapped onto intent status.
  - **Jira Product Discovery**: JPD keeps the idea funnel, insights, prioritisation and roadmaps; an idea gets an intent when it reaches a configured status. Push the intent ID, link and status into custom fields and never touch JPD's workflow status; pull description edits back as PRs; trace flags mismatches (JPD "Won't do" while the intent is ready). JPD ideas are Jira issues, but insights and some fields are harder to reach through the API and MCP; verify against the real site first.
  - **Confluence**: like Notion, an import source and optionally two-way through PRs.
  - A one-way publish job in CI for a mirror that must always be fresh; never a two-way sync engine.
- **An outcome add-on**: records written after delivery that judge an intent's Outcome with a measurement and a verdict.
- **Item-level links** (`INT-…#AC-2`) and acceptance-criteria coverage.
- Trace over open PRs, portfolio snapshots, and agent clustering of feedback into candidate intents.

## Open questions

- How a pure intent-home repo without code installs the add-on (`dld init` with only the add-on, or an intents-only config).
- Exactly how `check-edits` matches changelog entries to changed sections.
- Whether closed intents accept edits other than the Resolution section.
