# DLD Kit — Development Guide

## What this repo is

DLD Kit is a toolkit of AI agent skills implementing Decision-Linked Development. It is not an application — it produces no runnable code. The deliverables are skill files (SKILL.md), shell scripts, a steering rule, and documentation.

## Directory structure

```
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
  plan/                    # Skill design plan
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

Tests use [bats-core](https://github.com/bats-core/bats-core) installed as a git submodule at `tests/bats/`. Run tests with:

```bash
tests/bats/bin/bats tests/
```

If tests fail with "Could not find bats-support", init submodules first: `git submodule update --init --recursive`

## Conventions

- Commit messages: concise, no buzzwords
- Use PRs for changes (project is maturing)
- Run `tessl plugin lint` before committing skill changes
- Skills that involve user interaction should use the `AskUserQuestion` tool
