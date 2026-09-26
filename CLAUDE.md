# DLD Kit — Development Guide

## What this repo is

DLD Kit is a toolkit of AI agent skills implementing Decision-Linked Development. The deliverables are skill files (SKILL.md), a steering rule, documentation, and helper code the skills call. For 1.0 the bash helper scripts are being ported to a TypeScript CLI (`dld`, npm package `dld-kit`) — see `docs/plan/v1.md`. Until the skills switch to the CLI, both exist.

## Directory structure

```
package.json               # npm package dld-kit (bin: dld) — DL-002
src/                       # TypeScript CLI and library (Node 20+, ESM); *.test.ts colocated
  core/                    # library: config, records, index, annotations, audit, snapshot, state, reindex; no stdout, no process access (DL-007)
  cli/                     # `dld` dispatch and one module per command (DL-011)
  generate/                # skill generator and per-harness adapters (DL-032)
  node-context.ts          # real fs/git Context passed into core (DL-008)
  bin.ts                   # entry point
scripts/                   # Build (esbuild), skill generation, package check, bats-against-CLI runner, coverage report
templates/                 # canonical sources — edit these
  skills/dld-*/            # SKILL.md template + scripts/ per skill (DL-031)
  rules/dld-workflow.md    # always-on rule text (delivery decided in workstream 8)
skills/                    # GENERATED: portable Agent Skills layout (agent-skills adapter)
.claude/skills/            # GENERATED: Claude Code copy this repo runs (claude-code adapter)
tests/cli/                 # CLI integration tests: run the built dist/dld.mjs under node
docs/
  concept/                 # Design philosophy, FAQ, TL;DR
  framework/               # Decision record format, project configuration specs
  plan/                    # Design plans (skill design, 1.0 plan)
decisions/                 # dld-kit's OWN decision log (dogfooding, not shipped content)
  records/                 # DL-*.md decision records
  PRACTICES.md             # Development practices manifest
dld.config.yaml            # DLD config for this repo itself
```

## Skills are generated

Skill content lives only in `templates/skills/<skill>/` (DL-031). `npm run generate` renders it into `skills/` and `.claude/skills/` through the adapters in `src/generate/adapters.ts` (DL-032), and both outputs are committed. Never edit the generated copies; `npm run check:generated` fails when they differ from the templates (DL-033).

- In a template, reference supporting files as `{{script <skill>/<path>}}` (e.g. `{{script dld-common/scripts/next-id.sh}}`). Each adapter renders the path its harness needs. Other `{{...}}` text is left as written.
- Template frontmatter holds `name` (matching the directory), `description`, optional `compatibility`, and `internal: true` for skills that only provide shared files (`dld-common`).
- Generated SKILL.md files carry `metadata.dld-kit-version` and a notice pointing at their template.

## Shell scripts

Scripts live in `templates/skills/<skill>/scripts/` and are copied into the generated outputs. Shared utilities are in `dld-common/scripts/` (`common.sh`, `next-id.sh`, `regenerate-index.sh`, `update-status.sh`). Scripts use `set -euo pipefail` and source `common.sh` via `BASH_SOURCE` path resolution. They are replaced by the `dld` CLI in workstream 7.

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
npm run generate     # regenerate skills/ and .claude/skills/ from templates/
npm run check:generated  # fail if the generated skills are out of date
npm test             # all test layers
npm run check:pack   # npm pack dry-run against the files allowlist
```

Porting a script to the CLI (DL-011, DL-013): add a command under `src/cli/commands/` named after the script, with its logic in `src/core/`; register it in `src/cli/index.ts`; add its name to `tests/cli-ported.txt`; make `npm run test:bats:cli` pass without changing the bats tests.

bats is a git submodule at `tests/bats/`. If tests fail with "Could not find bats-support", init submodules first: `git submodule update --init --recursive`

## Conventions

- Commit messages: concise, no buzzwords
- Use PRs for changes (project is maturing)
- Edit skills in `templates/`, then run `npm run generate`
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
