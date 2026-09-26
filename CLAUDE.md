# DLD Kit — Development Guide

## What this repo is

DLD Kit is a toolkit of AI agent skills implementing Decision-Linked Development. The deliverables are skill files (SKILL.md), a steering rule, documentation, and helper code the skills call. Skills run their mechanical operations through a TypeScript CLI (`dld`, npm package `dld-kit`), bundled into the skills as a single file — see `docs/plan/v1.md` for the 1.0 plan.

## Directory structure

<!-- @decision(DL-053) -->
```
package.json               # npm package dld-kit (bin: dld) — DL-002
src/                       # TypeScript CLI and library (Node 20+, ESM); *.test.ts colocated
  core/                    # library: config, records, index, annotations, audit, snapshot, state, reindex; no stdout, no process access (DL-007)
  cli/                     # `dld` dispatch and one module per command (DL-011)
  generate/                # skill generator and per-harness adapters (DL-032)
  node-context.ts          # real fs/git Context passed into core (DL-008)
  bin.ts                   # entry point
scripts/                   # Build (esbuild), skill generation, package check, coverage report
templates/                 # canonical sources — edit these
  skills/dld-*/SKILL.md    # one template per skill (DL-031)
  rules/dld-workflow.md    # always-on rule text, installed by `dld install-rule` (DL-045)
skills/                    # GENERATED: portable Agent Skills layout, incl. dld-common/scripts/dld.mjs (DL-035)
.claude/skills/            # GENERATED: Claude Code copy this repo runs (claude-code adapter)
.claude/rules/             # GENERATED: this repo's copy of the always-on rule (DL-047)
claude-plugin/             # GENERATED: the Claude Code plugin: claude-code skills, plugin.json, SessionStart hook (DL-048)
.claude-plugin/marketplace.json  # GENERATED: Claude Code marketplace pointing at claude-plugin/ (DL-048)
plugin.json                # GENERATED: Agent Plugins manifest over skills/ for Codex and Copilot CLI (DL-050)
.agents/plugins/, .github/plugin/  # GENERATED: Codex and Copilot CLI marketplaces (DL-050)
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

<!-- @decision(DL-038) -->
Skill content lives only in `templates/skills/<skill>/` (DL-031). `npm run generate` renders it into `skills/` and `.claude/skills/` through the adapters in `src/generate/adapters.ts` (DL-032), and both outputs are committed. Never edit the generated copies; `npm run check:generated` fails when they differ from the templates (DL-033).

- Skills run operations only through the bundled CLI (DL-035): write `{{dld}} <command> ...` (e.g. `{{dld}} next-id`), and put `{{dld-setup}}` once before the first command. Each adapter renders the invocation its harness needs (DL-036). Other `{{...}}` text is left as written; `{{script <skill>/<path>}}` references any other supporting file.
- `npm run generate` builds `dist/dld.mjs` first and copies it to `dld-common/scripts/dld.mjs` in both outputs, so any change under `src/` needs a regenerate.
- `npm run generate` also writes `.claude/rules/dld-workflow.md` from `templates/rules/dld-workflow.md`; edit the template, not the copy.
- It also writes `claude-plugin/` (with the claude-code adapter) and the plugin and marketplace manifests, whose version and metadata come from `package.json` (DL-048, DL-050, DL-052). `.gitattributes` marks every generated path `linguist-generated`.
- Template frontmatter holds `name` (matching the directory), `description`, optional `compatibility`, and `internal: true` for skills that only provide shared files (`dld-common`).
- Generated SKILL.md files carry `metadata.dld-kit-version` and a notice pointing at their template.

## Testing

Dependencies are installed with Bun from `bun.lock`: `bun install`. Bun is a development tool only; shipped code targets Node 20+ (DL-001).

```bash
npm run lint         # Biome (lint + format check); lint:fix to apply
npm run typecheck    # tsc, including a Node-only pass over src/ that rejects Bun APIs
npm run test:unit    # bun test, colocated src/**/*.test.ts
npm run test:coverage  # unit tests with coverage; fails below 90% lines/functions per file (DL-020)
npm run test:cli     # builds dist/dld.mjs, then runs tests/cli under node
npm run generate     # regenerate skills/ and .claude/skills/ from templates/
npm run check:generated  # fail if the generated skills are out of date
npm test             # all test layers
npm run check:pack   # npm pack dry-run against the files allowlist
npm run check:installers  # install the skills with a pinned npx skills (needs network; after build)
```

Releases: `npm version <x>` and push the tag; `.github/workflows/release.yml` publishes. See `docs/releasing.md`.

Adding a command (DL-011): put its logic in `src/core/` with unit tests, add a module under `src/cli/commands/`, register it in `src/cli/index.ts`, cover it in `src/cli/commands.test.ts`, then call it from templates with `{{dld}} <command>` and run `npm run generate`.

## Conventions

- Commit messages: concise, no buzzwords
- Use PRs for changes (project is maturing)
- Edit skills in `templates/`, then run `npm run generate`
- Skills that involve user interaction should use the `AskUserQuestion` tool

## DLD (Decision-Linked Development)

This project uses Decision-Linked Development; the always-on rule is in `.claude/rules/dld-workflow.md`, generated from `templates/rules/dld-workflow.md`. `decisions/` is dld-kit's own decision log — dogfooding, not example content shipped to users. Development practices live in `decisions/PRACTICES.md`.
