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
# Default: @decision(DL-XXX)
annotation_prefix: "@decision"

# Whether /dld-implement runs a review subagent before finalizing
# Default: true
implement_review: true

# Custom snapshot artifacts (optional)
# Additional documents generated alongside SNAPSHOT.md and OVERVIEW.md
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

### Implement Review

When `implement_review` is `true` (the default), `/dld-implement` launches a review subagent over the changed files before finalizing. The point of using a separate agent is that it reads the diff cold — the implementing agent has just spent a long session convincing itself the code is right, and is poor at catching its own baked-in assumptions.

**Harness note:** some harnesses tell agents not to spawn subagents unless the user explicitly asked — Claude Code 2.1.220 ships `Do not call the AgentTool unless the user requested it`. The skill answers this by stating that enabling `implement_review` and running the skill *is* the request. If the subagent still doesn't run, the skill falls back to an inline review and requires the agent to say so; treat those runs as a weaker check.

Set `implement_review: false` to skip the step entirely — appropriate if the project already runs an independent review in CI or on the PR.

### Snapshot Artifacts

The optional `snapshot_artifacts` key lets you define custom documentation artifacts that are generated alongside `SNAPSHOT.md` and `OVERVIEW.md` when running `/dld-snapshot`. Each artifact is synthesized from the current set of accepted decisions using a prompt you provide.

Each entry has two fields:

- **`title`** — The filename for the artifact. Must end in `.md`. Also used as the document's H1 heading (without the `.md` extension). Must not collide with the reserved filenames `SNAPSHOT.md`, `OVERVIEW.md`, or `INDEX.md` (case-insensitive).
- **`prompt`** — A natural-language description that steers how the decisions are synthesized into the artifact. The agent uses this as the generation instruction, with the collected decisions as context.

Artifacts are written to the `decisions/` directory alongside the built-in snapshot files.

### ID Assignment

The next available ID is derived by scanning existing decision files rather than tracked in config. This avoids merge conflicts when multiple people create decisions concurrently. The framework scans all `DL-NNN.md` filenames in the `records/` subdirectory (including namespace subdirectories), finds the highest existing ID, and increments by one.

## The `/dld-init` Skill

The `/dld-init` skill bootstraps DLD in a repository:

1. Asks whether the project is flat or namespaced
2. If namespaced, asks for the initial namespace list
3. Creates `dld.config.yaml` at the repo root
4. Creates the `decisions/` directory with a `records/` subdirectory (and namespace subdirectories under `records/` if applicable)
5. Adds DLD instructions to `CLAUDE.md` — specifically, the instruction for the AI agent to look up `@decision` references before modifying annotated code

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
