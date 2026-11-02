# Project Configuration

## Config File

DLD is configured per-project via a `dld.config.yaml` file at the repository root. This file is created by the `/dld-init` skill and defines the project's DLD setup.

### Schema

```yaml
# dld.config.yaml

# Where decision records are stored, relative to repo root
decisions_dir: decisions

# Project structure mode
# - flat: all decisions in a single directory
# - namespaced: decisions organized in subdirectories per component/domain
mode: flat

# Namespaces (only used when mode is "namespaced")
# Each namespace maps to a subdirectory under decisions_dir/records/
namespaces:
  - billing
  - auth
  - shared

# Decision annotation pattern used in code comments
# Default: @decision(DL-XXX). The always-on rule is installed with this prefix.
annotation_prefix: "@decision"

# Paths whose annotations are ignored (optional)
# git glob patterns relative to the repo root; see "Annotation exclusions" below
annotation_exclude:
  - docs/**
  - tests/fixtures/**

# Whether /dld-implement runs a review subagent before finalizing
# Default: true
implement_review: true

# Whether /dld-plan runs a review subagent over the decisions it wrote
# Default: false
plan_review: false

# The model for review subagents (optional), passed to the agent as written
# Default: the harness's default model
review_model: sonnet
# Per-step overrides of review_model (optional)
implement_review_model: opus
plan_review_model: opus

# Whether agents may edit the prose of decisions already on the base branch
# block (default): never; amend or supersede instead
# ask: after the user confirms
# allow: yes, to keep records accurate
decision_edits: block

# The branch decisions are checked against (optional)
# Default: the upstream when it tracks another branch, else origin/HEAD,
# else origin/main, main, origin/master or master. See "Base branch" below.
base_branch: main

# Custom snapshot artifacts (optional)
# Additional documents generated alongside OVERVIEW.md
# by the /dld-snapshot skill. Each entry defines a filename and a prompt
# that steers how decisions are synthesized into the artifact.
snapshot_artifacts:
  - title: ONBOARDING.md
    prompt: >
      Generate a developer onboarding guide that explains the system
      from scratch, assuming no prior context.
  - title: API-CONTRACTS.md
    prompt: >
      Summarize all API-related decisions into a single API contract reference.
```

### Minimal Config (flat project)

```yaml
decisions_dir: decisions
mode: flat
```

### Monorepo Config

```yaml
decisions_dir: decisions
mode: namespaced
namespaces:
  - billing
  - auth
  - api-gateway
  - shared
```

### Annotation exclusions

`annotation_exclude` lists paths whose annotations are not treated as references to the project's decisions. Use it for documentation, examples and test fixtures that contain `` `@decision` `` annotations only to illustrate the syntax. `find-annotations` (used by `/dld-audit`) and `verify-annotations` (used by `/dld-implement`) both skip matching files.

Each entry is a git glob pattern relative to the repository root, applied as a `:(exclude,glob)` pathspec. `*` matches within a single directory level, so `*.md` matches only top-level markdown files; `**` matches across directories, so `docs/**` covers everything under `docs/`. A pattern that matches a directory excludes everything beneath it, so `docs/*` also covers `docs/sub/…`. Patterns must be relative to the root; absolute paths and `..` are rejected. Files ignored by `.gitignore`, the decisions directory, and common build and dependency directories are always skipped.

### Reviews

#### Implement review

When `implement_review` is `true` (the default), `/dld-implement` launches a review subagent over the changed files before finalizing. The point of using a separate agent is that it reads the diff cold — the implementing agent has just spent a long session convincing itself the code is right, and is poor at catching its own baked-in assumptions.

**Harness note:** some harnesses tell agents not to spawn subagents unless the user explicitly asked — Claude Code 2.1.220 ships `Do not call the AgentTool unless the user requested it`. The skill answers this by stating that enabling `implement_review` and running the skill *is* the request. If the subagent still doesn't run, the skill falls back to an inline review and requires the agent to say so; treat those runs as a weaker check.

The reviewer checks for correctness, security issues, type safety problems, and consistency with existing patterns, and reports findings grouped by severity (critical, moderate, minor). It works with limited context and may flag false positives; the implementing agent uses its own judgment and asks you when uncertain about a finding.

Set `implement_review: false` to skip the step entirely — appropriate if the project already runs an independent review in CI or on the PR.

#### Plan review

When `plan_review` is `true` (default `false`), `/dld-plan` launches a review subagent after it has written the proposed decisions. The reviewer checks the plan for coverage of the feature, decisions that bundle several choices, conflicts with existing decisions and missing `amends` or `supersedes` links, values an implementer would have to guess, the order of the decisions, and the project's practices. The planning agent fixes what it can in the new records, which are still drafts, and asks you when a fix would change what a decision means. Plans are not reviewed by default: most are small, and the implementation review already runs.

#### Review models

`review_model` names the model the review subagents run on, and `implement_review_model` and `plan_review_model` override it for one step. The names are passed to the agent as written, so use the names your harness knows (for example `opus` in Claude Code). An agent whose harness can't choose a subagent's model, or doesn't know the name, runs the review on its default model and says so; the report always names the model that reviewed. Unset, reviews use the harness's default. Model names are one line, without surrounding spaces. In `dld.local.yaml`, `review_model: default` (or the per-step key set to `default`) puts your reviews back on the harness's default when the team's config names a model.

A team whose members use different harnesses usually leaves the models unset here and lets each developer set theirs in `dld.local.yaml` (below).

You can always ask for something else in the request for one run, for example "implement DL-012 and use haiku as the reviewer"; that wins over both files.

#### Personal settings: dld.local.yaml

`dld.local.yaml`, next to `dld.config.yaml` at the repository root, holds one developer's settings for that checkout. It is never committed: `dld init` and `dld update` add it to the root `.gitignore` unless git already ignores it.

```yaml
# dld.local.yaml
review_model: haiku
plan_review: true
```

It accepts only the review settings (`implement_review`, `plan_review`, `review_model`, `implement_review_model`, `plan_review_model`) and keys starting with `x-`. Team settings such as `decision_edits` or `base_branch` are ignored there, with a warning, so one checkout can't loosen the team's rules. For each review, the effective setting is the first one found in: your request for that run, `dld.local.yaml`, `dld.config.yaml`, then the default. Within one file, a step's own model key wins over `review_model`. The skills read them through `dld review-settings implement` or `dld review-settings plan`, which prints the result and where each value came from.

### Decision edits

A decision record is a **draft** until it reaches the base branch (see [Base branch](#base-branch); in a local-only repository that is usually `main`, so a record is integrated once it is committed there): edit it freely, whatever its status. Records that are still `proposed` on the base branch stay drafts too. Once a record is on the base branch, its frontmatter (`status`, `references`, `amends`, `supersedes`, `tags`, `title`) can still be updated, but its prose (the body below the frontmatter), `id` and `timestamp` are protected. `decision_edits` sets how strictly:

- `block` (default): agents never edit it, even when asked. They record a new decision that amends or supersedes it instead. People can still edit by hand.
- `ask`: agents edit it after you confirm.
- `allow`: agents edit it when that keeps the record accurate, and say so in their summary.

`/dld-audit-auto` always behaves as `block`. The skills that write records finish with `dld check-decision-edits --uncommitted`, which lists the decisions on the base branch whose prose, `id` or `timestamp` has uncommitted changes, or that were deleted. Edits already committed, such as a fix you made by hand, are left alone.

Without `--uncommitted`, the command checks the whole branch against the base, and exits 3 under `block` when it lists an `edited` or `deleted` decision. That makes it a CI gate for pull requests. The job needs the base branch's history to find the merge-base:

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
- run: npx dld-kit@latest check-decision-edits --base origin/${{ github.base_ref }}
```

`check-decision-edits` is part of the CLI's semver contract: its options, its output lines (`<path>`, a tab, `<DL-NNN>`, a tab, the state) and its exit codes (0 nothing blocked, 1 error, 2 usage error, 3 blocked) only change in a major version.

To land a deliberate edit under `block`, such as fixing a typo, add a `Decision-Edit:` trailer naming the decisions to a commit on the branch:

```
Fix a typo in DL-012

Decision-Edit: DL-012
```

The gate then prints those decisions as `allowed` and does not fail for them. Several IDs can share a trailer, separated by commas or spaces. git only reads trailers from the last paragraph of the commit message, after a blank line, and only when that paragraph holds nothing but trailers: `git commit -m "Fix a typo in DL-012" -m "Decision-Edit: DL-012"` works, while a trailer on the line right after the subject, or mixed with other text, is ignored. The trailer is visible in review and in the history, which is the point: it stops accidental edits, not deliberate ones.

### Base branch

Reindex (`/dld-reindex`) and the decision-edit checks compare the current branch with a base branch. dld-kit picks it in this order:

1. `base_branch` from `dld.config.yaml`: `origin/<base_branch>` if that ref exists, else the local `<base_branch>`.
2. The current branch's upstream, when it tracks a branch with a different name.
3. The remote's default branch, `origin/HEAD` (set by `git clone`, or by `git remote set-head origin --auto`).
4. `origin/main`, then the local `main`.
5. `origin/master`, then the local `master`.

Only a ref that exists is used. When none does, the commands fail and say what they tried; `list-proposed` instead lists every proposed decision as `unknown`, with a warning. Set `base_branch` when the branch decisions merge into is not the remote's default, for example a long-lived `develop` branch.

### Unknown keys

Keys that are not part of this schema are ignored, with a warning on stderr from every `dld` command that reads the config, for example `Warning: dld.config.yaml: unknown key 'decision_edit'; did you mean 'decision_edits'?`. Unknown keys stay warnings, never errors, throughout 1.x. Keys starting with `x-` never warn: dld-kit will never use that prefix, so it is yours for project settings, for example `x-team: {owner: platform}`.

### Snapshot Artifacts

The optional `snapshot_artifacts` key lets you define custom documentation artifacts that are generated alongside `OVERVIEW.md` when running `/dld-snapshot`. Each artifact is synthesized from the current set of accepted decisions using a prompt you provide. Proposed decisions are passed along too, as planned work, and are marked as proposed wherever an artifact mentions them.

Each entry has two fields:

- **`title`** — The filename for the artifact. Must end in `.md`. Also used as the document's H1 heading (without the `.md` extension). Must not collide with the reserved filenames `OVERVIEW.md` or `INDEX.md` (case-insensitive).
- **`prompt`** — A natural-language description that steers how the decisions are synthesized into the artifact. The agent uses this as the generation instruction, with the collected decisions as context.

Artifacts are written to the `decisions/` directory alongside `OVERVIEW.md`.

Earlier versions also generated a built-in `SNAPSHOT.md`. `/dld-snapshot` now offers to delete an existing one, unless an entry here is titled `SNAPSHOT.md`, in which case it is generated as a custom artifact.

For example:

```yaml
snapshot_artifacts:
  - title: ONBOARDING.md
    prompt: >
      Generate a developer onboarding guide that explains the system
      from scratch, assuming no prior context. Focus on what a new
      contributor needs to know to start working.
  - title: API-CONTRACTS.md
    prompt: >
      Summarize all API-related decisions into a single API contract
      reference. Include endpoints, payload shapes, and auth requirements.
```

### ID Assignment

The next available ID is derived by scanning existing decision files rather than tracked in config. This avoids merge conflicts when multiple people create decisions concurrently. The framework scans all `DL-NNN.md` filenames in the `records/` subdirectory (including namespace subdirectories), finds the highest existing ID, and increments by one.

## The `/dld-init` Skill

The `/dld-init` skill bootstraps DLD in a repository:

1. Asks whether the project is flat or namespaced
2. If namespaced, asks for the initial namespace list
3. Creates `dld.config.yaml` at the repo root
4. Creates the `decisions/` directory with a `records/` subdirectory (and namespace subdirectories under `records/` if applicable)
5. Installs the always-on rule (the instruction for the AI agent to look up `@decision` references before modifying annotated code) with `dld install-rule`, into the file the agent's harness loads

From a terminal, `npx dld-kit init` does the same without an agent session and also installs the skills; `dld update` refreshes them after an upgrade.

## Decision Log Index

A `decisions/INDEX.md` file is generated (not manually maintained) and provides a quick overview of all decisions:

```markdown
# Decision Log

| ID | Title | Status | Namespace | Tags |
|----|-------|--------|-----------|------|
| DL-012 | Customer-specific VAT rounding for EU trade | accepted | billing | vat, eu-compliance |
| DL-011 | Rate limiting strategy | accepted | api-gateway | |
| ...  | ... | ... | ... | ... |
```

This index can be regenerated deterministically from the decision files at any time. It is regenerated automatically whenever a decision is created or updated.
