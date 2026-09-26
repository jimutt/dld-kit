# Development Practices

dld-kit is moving from bash scripts to a TypeScript CLI and library for 1.0 (see `docs/plan/v1.md`). Until the port is complete both layers exist; the practices below cover each, and the shell section retires with the scripts.

## Testing

- Every behaviour change comes with tests. Cover the happy path, missing-file and missing-config cases, and the edge cases that have bitten before (ID gaps, octal-unsafe numbers like `DL-008`, namespaced vs flat layout).
- Tests must not touch the developer's real repo — fixtures create a temporary git project and tear it down.
- All test suites and the typecheck must pass before a commit.

### Shell scripts (bats) — during the port

- Tests use [bats-core](https://github.com/bats-core/bats-core), vendored as a git submodule at `tests/bats/`. Run the suite with `npm run test:bats` (or `tests/run.sh`). If bats is missing, run `git submodule update --init --recursive`.
- One test file per script or area: `tests/test_<script-or-area>.bats`, using `load 'test_helper/common'` and the shared fixtures (`setup_flat_project`, `setup_namespaced_project`, `create_decision`, `teardown_project`).
- The bats suite is the behavioural specification for the port. A ported command must pass the same bats tests as the script it replaces before the script is removed. Do not weaken or delete a bats test to make a port pass.

### TypeScript (bun)

- Unit tests run with `bun test` (`npm run test:unit`) and live beside the code they cover as `*.test.ts`.
- CLI integration tests live in `tests/cli/` and run the built `dist/dld.mjs` under `node` (`npm run test:cli`).
- Typecheck (`npm run typecheck`) and Biome (`npm run lint`) are part of the definition of done.
- Prefer dependency injection (filesystem, git, clock, process execution) over module-level side effects, so failure branches are reachable from unit tests. A function that can only touch the real filesystem can only ever be tested in the happy case.
- The library is tested through unit tests against its functions; the CLI is covered by a thinner set of integration tests against the command surface.

## TypeScript

- Node 20+ is the supported runtime. Bun is a development tool (test runner, scripts) only — nothing shipped may require Bun.
- ESM throughout.
- Strict mode, including `noUncheckedIndexedAccess`. Indexing an array yields `T | undefined` and must be handled.
- Avoid type assertions (`as`) to silence a mismatch — they turn compile errors into runtime errors. Where one is genuinely unavoidable, confine it and comment why.
- Keep runtime dependencies to a minimum; the CLI must also bundle into a single zero-dependency file that ships inside the skills.
- The library holds the logic; the CLI is a thin layer that parses arguments, calls the library, and formats output.
- Operations are deterministic and mechanical: assign IDs, rewrite frontmatter, scan for annotations, regenerate the index. Judgment, prose, and user interaction belong in SKILL.md, not in code.
- Fail loudly: a clear message on stderr and a non-zero exit code. Distinguish "nothing found" from "something broke" in exit codes.
- Writes that must not be observed half-finished use a temp file plus rename.

## Shell scripts — until retired

- Pure bash plus POSIX tools (`grep`, `sed`, `awk`, `find`, `git`). No new dependencies.
- Every script starts with `#!/usr/bin/env bash` and `set -euo pipefail`, resolves paths with `BASH_SOURCE`, and sources shared helpers from `dld-common/scripts/common.sh`.
- No new scripts. New mechanical behaviour goes into the TypeScript library.

## Skills

- Until the generator lands, skills exist in two synchronized places: `skills/` and `.claude/skills/`. Content must match; only script path references and frontmatter differ. Update both copies in the same change. Once skills are generated from canonical templates, edit the templates only and never the generated output.
- Skills that ask the user anything use the `AskUserQuestion` tool rather than waiting for freeform replies.
- SKILL.md documents the commands or scripts it uses, checks prerequisites before doing work, and ends by suggesting next steps.
- In markdown, escape the annotation pattern as `` `@decision` ``.

## Decision records

- Decision content is immutable once `accepted`. Metadata (`status`, `references`, relational fields) can be updated mechanically; the narrative body cannot be rewritten. Corrections happen through a new decision that supersedes or amends the old one.
- Every implemented decision has at least one `@decision(DL-NNN)` annotation in the code it explains. The annotation is a pointer, not a summary — do not restate the decision's rationale in comments.

## Documentation

- Markdown prose is not hard-wrapped. One paragraph, list item, or table row per source line; let renderers handle wrapping.
- Design work that is bigger than a single decision goes in `docs/plan/` before implementation.

## Git

- `v1` is the integration branch for 1.0. Work happens on stacked branches whose PRs target `v1` or the branch below them.
- Commit messages are concise and factual. No buzzwords, no padding.
