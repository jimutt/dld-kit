# Development Practices

## Testing

- Tests use [bats-core](https://github.com/bats-core/bats-core), vendored as a git submodule at `tests/bats/`. Run the suite with `tests/run.sh` (or `tests/bats/bin/bats tests/`). If bats is missing, run `git submodule update --init --recursive`.
- One test file per script: `tests/test_<script-or-area>.bats`. Use `load 'test_helper/common'` and the shared fixtures (`setup_flat_project`, `setup_namespaced_project`, `create_decision`, `teardown_project`).
- Every shell script gets tests. Cover the happy path, missing-file and missing-config cases, and the edge cases that have bitten before (ID gaps, octal-unsafe numbers like `DL-008`, namespaced vs flat layout).
- Tests must not touch the developer's real repo — fixtures create a temporary git project and tear it down.

## Shell scripts

- Pure bash plus POSIX tools (`grep`, `sed`, `awk`, `find`, `git`). Avoid adding dependencies. Where a dependency is unavoidable, scope it to the skill that needs it and declare it in that skill's `compatibility` frontmatter.
- Every script starts with `#!/usr/bin/env bash` and `set -euo pipefail`.
- Resolve paths with `BASH_SOURCE`, and source shared helpers via `source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"`. Never assume the caller's working directory.
- Scripts are deterministic and mechanical: assign IDs, rewrite frontmatter, scan for annotations, regenerate the index. Judgment, prose, and user interaction belong in SKILL.md, not in scripts.
- Fail loudly with a message on stderr and a non-zero exit. Do not silently continue.
- Writes that must not be observed half-finished use a temp file plus `mv` (atomic rename).

## Skills

- Skills exist in two synchronized places: `skills/` (Tessl plugin) and `.claude/skills/` (Claude Code manual install). Content must match. The only permitted differences are script path references (relative vs `.claude/skills/`-prefixed) and frontmatter (`compatibility` vs `user_invocable`). Update both copies in the same change.
- Skills that ask the user anything use the `AskUserQuestion` tool rather than waiting for freeform replies.
- SKILL.md documents the script paths it uses in a "Script Paths" section, checks prerequisites before doing work, and ends by suggesting next steps.
- In markdown, escape the annotation pattern as `` `@decision` `` — unescaped, the Tessl linter reads it as a file reference.
- Run `tessl plugin lint` before committing skill changes.

## Decision records

- Decision content is immutable once `accepted`. Metadata (`status`, `references`, relational fields) can be updated mechanically; the narrative body cannot be rewritten. Corrections happen through a new decision that supersedes or amends the old one.
- Every implemented decision has at least one `@decision(DL-NNN)` annotation in the code it explains. The annotation is a pointer, not a summary — do not restate the decision's rationale in comments.

## Documentation

- Markdown prose is not hard-wrapped. One paragraph, list item, or table row per source line; let renderers handle wrapping.
- Design work that is bigger than a single decision goes in `docs/plan/` before implementation.

## Git

- Work happens on branches and lands via PR.
- Commit messages are concise and factual. No buzzwords, no padding.
