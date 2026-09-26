# DLD Kit — Development Guide

## What this repo is

DLD Kit is a toolkit of AI agent skills implementing Decision-Linked Development. The deliverables are skill files (SKILL.md), a steering rule, documentation, and helper code the skills call. For 1.0 the bash helper scripts are being ported to a TypeScript CLI (`dld`, npm package `dld-kit`) — see `docs/plan/v1.md`. Until the port completes, both exist.

## Directory structure

```
package.json               # npm package dld-kit (bin: dld) — DL-002
src/                       # TypeScript CLI and library (Node 20+, ESM); *.test.ts colocated
  core/                    # library: config, records, index, annotations, audit, snapshot, state, reindex; no stdout, no process access (DL-007)
  cli/                     # `dld` dispatch and one module per command (DL-011)
  node-context.ts          # real fs/git Context passed into core (DL-008)
  bin.ts                   # entry point
scripts/                   # Build (esbuild), package check, bats-against-CLI runner, coverage report; run with node
tests/cli/                 # CLI integration tests: run the built dist/dld.mjs under node
.tessl-plugin/
  plugin.json              # Tessl plugin manifest (packaging for multi-agent distribution)
rules/
  dld-workflow.md          # Tessl steering rule (always-on agent guidance)
skills/                    # Tessl plugin skills (used by tessl install)
  dld-*/                   # Each skill has SKILL.md + optional scripts/
.claude/skills/            # Claude Code skills (used by manual copy install)
  dld-*/                   # Mirror of skills/ — see "Dual directory" below
docs/
  concept/                 # Design philosophy, FAQ, TL;DR
  framework/               # Decision record format, project configuration specs
  plan/                    # Design plans (skill design, 1.0 plan)
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

Dependencies are installed with Bun from `bun.lock`: `bun install`. Bun is a development tool only; shipped code targets Node 20+ (DL-001).

```bash
npm run lint         # Biome (lint + format check); lint:fix to apply
npm run typecheck    # tsc, including a Node-only pass over src/ that rejects Bun APIs
npm run test:unit    # bun test, colocated src/**/*.test.ts
npm run test:coverage  # unit tests with coverage; fails below 90% lines/functions per file (DL-020)
npm run test:cli     # builds dist/dld.mjs, then runs tests/cli under node
npm run test:bats    # bats suite for the shell scripts (until the port completes)
npm run test:bats:cli  # the same bats suite, with ported scripts replaced by the CLI
npm test             # all test layers
npm run check:pack   # npm pack dry-run against the files allowlist
```

Porting a script to the CLI (DL-011, DL-013): add a command under `src/cli/commands/` named after the script, with its logic in `src/core/`; register it in `src/cli/index.ts`; add its name to `tests/cli-ported.txt`; make `npm run test:bats:cli` pass without changing the bats tests.

bats is a git submodule at `tests/bats/`. If tests fail with "Could not find bats-support", init submodules first: `git submodule update --init --recursive`

## Conventions

- Commit messages: concise, no buzzwords
- Use PRs for changes (project is maturing)
- Run `tessl plugin lint` before committing skill changes
- Skills that involve user interaction should use the `AskUserQuestion` tool

## DLD (Decision-Linked Development)

This project uses Decision-Linked Development. Decision records (DL-*.md) live in `decisions/records/`. High-level docs (INDEX.md, OVERVIEW.md, SNAPSHOT.md) live in `decisions/`.

`decisions/` is dld-kit's own decision log — dogfooding, not example content shipped to users. Development practices live in `decisions/PRACTICES.md`.

### Rules

- When you encounter `@decision(DL-XXX)` annotations in code, use `/dld-lookup DL-XXX` to read the referenced decision BEFORE modifying the annotated code.
- ALWAYS look up and verify related decisions before modifying annotated code. Do not skip this step.
- NEVER modify code in a way that contradicts an existing decision without first confirming with the user. If the change requires breaking a previous decision, a new decision must be recorded (via `/dld-decide`) that explicitly supersedes the old one.
- Use `/dld-decide` to record new decisions
- Use `/dld-plan` to break down a feature into multiple grouped decisions
- Use `/dld-implement` to implement proposed decisions
- Use `/dld-lookup` to query decisions by ID, tag, or code path
- Use `/dld-audit` to scan for drift between decisions and code
- Use `/dld-snapshot` to regenerate SNAPSHOT.md and OVERVIEW.md from the decision log
- Use `/dld-status` for a quick overview of the decision log state
- Use `/dld-retrofit` to generate decisions from an existing codebase
