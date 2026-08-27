# Development Practices

## Testing

The repository has two test layers with a runner each. They cover different code and do not overlap: bats for shell scripts, `bun test` for the pi extension. Both must pass before a commit.

### Shell scripts (bats)

- Tests use [bats-core](https://github.com/bats-core/bats-core), vendored as a git submodule at `tests/bats/`. Run the suite with `tests/run.sh` (or `tests/bats/bin/bats tests/`). If bats is missing, run `git submodule update --init --recursive`.
- One test file per script: `tests/test_<script-or-area>.bats`. Use `load 'test_helper/common'` and the shared fixtures (`setup_flat_project`, `setup_namespaced_project`, `create_decision`, `teardown_project`).
- Every shell script gets tests. Cover the happy path, missing-file and missing-config cases, and the edge cases that have bitten before (ID gaps, octal-unsafe numbers like `DL-008`, namespaced vs flat layout).
- Tests must not touch the developer's real repo — fixtures create a temporary git project and tear it down.

### Pi extension (bun)

- Tests run with `bun test` and live beside the code they cover, as `*.test.ts` in `extensions/pi-dld-run/`. Pi loads only `index.ts` from an extension directory, so colocated tests are never loaded as extensions.
- The extension is typechecked with `npx tsc --noEmit`, which requires `npm install` for the pi type definitions. Typecheck is part of the definition of done, not an optional extra — it is the only mechanism that catches a drift between our assumptions and the real pi API.
- Tests exercise the extension through the fake in `extensions/pi-dld-run/testing/fake-pi.ts`, never a live harness.
- The fake's surface is declared with `Pick<ExtensionAPI, ...>` and assigned without type assertions, so the compiler rejects a fake that no longer matches pi. Do not reach for `as` to silence a mismatch — it converts a compile error into a runtime `TypeError`. Where a partial object genuinely cannot be typed (a context object standing in for a large interface), confine the assertion and comment why.
- Prefer dependency injection over module-level side effects, so failure branches are reachable from tests. A check that can only read the real filesystem can only ever be tested in the happy case.

## TypeScript

- The extension ships as source. No bundler, no build output, no compile step before install.
- Import with explicit `.ts` extensions (`./paths.ts`), which is what both pi's loader and bun expect.
- Strict mode, including `noUncheckedIndexedAccess`. Indexing an array yields `T | undefined` and must be handled.
- Pi runtime packages (`@earendil-works/pi-*`) are optional peer dependencies, never bundled. They are also dev dependencies purely to supply types.
- The extension reads run state directly but performs no state mutation of its own — every mutation goes through the skill scripts. See DL-007.

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
