# DLD Kit — Development Guide

## What this repo is

DLD Kit is a toolkit of AI agent skills implementing Decision-Linked Development. It is not an application — it produces no runnable code. The deliverables are skill files (SKILL.md), shell scripts, a steering rule, and documentation.

## Directory structure

```
tile.json                  # Tessl tile manifest (packaging for multi-agent distribution)
rules/
  dld-workflow.md          # Tessl steering rule (always-on agent guidance)
skills/                    # Tessl tile skills (used by tessl install)
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

- **`skills/`** — The Tessl tile version. Referenced by `tile.json`. Uses relative script paths (`scripts/create-config.sh`). Has `compatibility` field instead of `user_invocable` in frontmatter. Validated by `tessl tile lint`.
- **`.claude/skills/`** — The Claude Code manual-install version. Uses `.claude/skills/dld-*/scripts/` paths. Has `user_invocable: true` in frontmatter.

The content (instructions, logic, templates) must match between the two. The differences are only in:
- Script path references (relative vs `.claude/skills/` prefixed)
- Frontmatter fields (`compatibility` vs `user_invocable`)
- The tessl version may have a note about steering rules replacing CLAUDE.md instructions

When modifying a skill, update **both** copies.

## Tessl packaging

- `tile.json` defines the tile `dld-kit/dld@0.1.0`
- `rules/dld-workflow.md` is a steering rule (always loaded, ~300 tokens)
- Validate with: `tessl tile lint`
- The `@decision` pattern in markdown must be backtick-escaped (`` `@decision` ``) or the linter interprets it as a file reference

## Shell scripts

Scripts live in `skills/<skill>/scripts/` (tessl) and `.claude/skills/<skill>/scripts/` (Claude Code). Shared utilities are in `dld-common/scripts/`:

- `common.sh` — config reading, path resolution
- `next-id.sh` — sequential ID assignment
- `regenerate-index.sh` — rebuilds INDEX.md
- `update-status.sh` — updates decision status in frontmatter

Scripts use `set -euo pipefail` and source `common.sh` via `BASH_SOURCE` path resolution.

## Conventions

- Commit messages: concise, no buzzwords
- Use PRs for changes (project is maturing)
- Run `tessl tile lint` before committing skill changes
- Skills that involve user interaction should use the `AskUserQuestion` tool
