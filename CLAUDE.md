# DLD Kit — Development Guide

## What this repo is

DLD Kit is a toolkit of AI agent skills implementing Decision-Linked Development. It is not an application — it produces no runnable code. The deliverables are skill files (SKILL.md), shell scripts, a steering rule, and documentation.

## Directory structure

```
package.json               # Pi package manifest (extensions + skills) — see DL-006
.tessl-plugin/
  plugin.json              # Tessl plugin manifest (packaging for multi-agent distribution)
extensions/
  dld-run/                # Pi extension: TypeScript, loaded from source, no build step
    index.ts               # Entry point — pi loads only index.ts from a subdirectory
    *.test.ts              # Colocated unit tests (bun)
    testing/fake-pi.ts     # Faked ExtensionAPI used by the tests
rules/
  dld-workflow.md          # Tessl steering rule (always-on agent guidance)
skills/                    # Tessl plugin skills (used by tessl install)
  dld-*/                   # Each skill has SKILL.md + optional scripts/
.claude/skills/            # Claude Code skills (used by manual copy install)
  dld-*/                   # Mirror of skills/ — see "Dual directory" below
docs/
  concept/                 # Design philosophy, FAQ, TL;DR
  framework/               # Decision record format, project configuration specs
  plan/                    # Design plans (skill design, goal loop)
  research/                # Prior-art research briefs
decisions/                 # dld-kit's OWN decision log (dogfooding, not shipped content)
  records/                 # DL-*.md decision records
  PRACTICES.md             # Development practices manifest
dld.config.yaml            # DLD config for this repo itself
```

## Dual directory layout

Skills exist in **two places** that must be kept in sync:

- **`skills/`** — The Tessl plugin version. Referenced by `.tessl-plugin/plugin.json`. Uses relative script paths (`scripts/create-config.sh`). Has `compatibility` field instead of `user_invocable` in frontmatter. Validated by `tessl plugin lint`.
- **`.claude/skills/`** — The Claude Code manual-install version. Uses `.claude/skills/dld-*/scripts/` paths. Has `user_invocable: true` in frontmatter.

The content (instructions, logic, templates) must match between the two. The differences are only in:
- Script path references (relative vs `.claude/skills/` prefixed)
- Frontmatter fields (`compatibility` vs `user_invocable`)
- The tessl version may have a note about steering rules replacing CLAUDE.md instructions

When modifying a skill, update **both** copies.

## Tessl packaging

- `.tessl-plugin/plugin.json` defines the plugin `dld-kit/dld`
- `rules/dld-workflow.md` is a steering rule (always loaded, ~300 tokens)
- Validate with: `tessl plugin lint`
- The `@decision` pattern in markdown must be backtick-escaped (`` `@decision` ``) or the linter interprets it as a file reference

## Shell scripts

Scripts live in `skills/<skill>/scripts/` (tessl) and `.claude/skills/<skill>/scripts/` (Claude Code). Shared utilities are in `dld-common/scripts/`:

- `common.sh` — config reading, path resolution
- `next-id.sh` — sequential ID assignment
- `regenerate-index.sh` — rebuilds INDEX.md
- `update-status.sh` — updates decision status in frontmatter

Scripts use `set -euo pipefail` and source `common.sh` via `BASH_SOURCE` path resolution.

## Testing

Two layers, two runners. Both must pass before committing.

**Shell scripts** use [bats-core](https://github.com/bats-core/bats-core), installed as a git submodule at `tests/bats/`:

```bash
tests/run.sh
```

If tests fail with "Could not find bats-support", init submodules first: `git submodule update --init --recursive`

**The pi extension** uses `bun test`, plus a typecheck that is part of the definition of done:

```bash
npm install        # once, for pi type definitions
bun test
npx tsc --noEmit
```

See `decisions/PRACTICES.md` for the conventions each layer follows.

## Conventions

- Commit messages: concise, no buzzwords
- Use PRs for changes (project is maturing)
- Run `tessl plugin lint` before committing skill changes
- Skills that involve user interaction should use the `AskUserQuestion` tool
- Changing a skill's scripts or the run contract usually means changing the extension too — they are one package for that reason

## DLD (Decision-Linked Development)

dld-kit uses its own toolkit. `decisions/` is dld-kit's real decision log — it is dogfooding, not example content shipped to users. Development practices live in `decisions/PRACTICES.md`.

Decision records (DL-*.md) live in `decisions/records/`. High-level docs (INDEX.md, OVERVIEW.md, SNAPSHOT.md) live in `decisions/`.

### Rules

- When you encounter `@decision(DL-XXX)` annotations in code, use `/dld-lookup DL-XXX` to read the referenced decision BEFORE modifying the annotated code.
- ALWAYS look up and verify related decisions before modifying annotated code. Do not skip this step.
- NEVER modify code in a way that contradicts an existing decision without first confirming with the user. If the change requires breaking a previous decision, a new decision must be recorded (via `/dld-decide`) that explicitly supersedes the old one. If it only partially modifies a previous decision, record it as an amendment instead.
- Use `/dld-decide` to record new decisions
- Use `/dld-plan` to break down a feature into multiple grouped decisions
- Use `/dld-implement` to implement proposed decisions
- Use `/dld-run` to execute a set of proposed decisions as a long-running run (durable state, verified per-item completion)
- Use `/dld-lookup` to query decisions by ID, tag, or code path
- Use `/dld-audit` to scan for drift between decisions and code
- Use `/dld-snapshot` to regenerate SNAPSHOT.md and OVERVIEW.md from the decision log
- Use `/dld-status` for a quick overview of the decision log state

When running these skills against dld-kit itself, invoke the scripts from `skills/<skill>/scripts/` (the Tessl copy) — both copies are identical in behaviour, and `skills/` is the canonical one.
