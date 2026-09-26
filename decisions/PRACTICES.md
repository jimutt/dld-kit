# Development Practices

dld-kit's skills run their mechanical operations through a TypeScript CLI and library (see `docs/plan/v1.md`), bundled into the skills as a single file.

## Testing

- Every behaviour change comes with tests. Cover the happy path, missing-file and missing-config cases, and the edge cases that have bitten before (ID gaps, octal-unsafe numbers like `DL-008`, namespaced vs flat layout).
- Tests must not touch the developer's real repo — fixtures create a temporary git project and tear it down.
- All test suites and the typecheck must pass before a commit.

### Test layers

- Unit tests run with `bun test` (`npm run test:unit`) and live beside the code they cover as `*.test.ts`.
- CLI integration tests live in `tests/cli/` and run the built `dist/dld.mjs` under `node` (`npm run test:cli`).
- Typecheck (`npm run typecheck`) and Biome (`npm run lint`) are part of the definition of done.
- Unit coverage is measured with `npm run test:coverage`. Every file under `src/` must stay at or above 90% of lines and functions (DL-020); CI reports coverage and its change on each PR.
- Prefer dependency injection (filesystem, git, clock, process execution) over module-level side effects, so failure branches are reachable from unit tests. A function that can only touch the real filesystem can only ever be tested in the happy case.
- The library is tested through unit tests against its functions; the CLI is covered by a thinner set of integration tests against the command surface. Bun tests are the behavioural specification: a behaviour without a test is not guaranteed (DL-037).
- `npm run check:generated` verifies the committed skills match the templates and the current CLI build (DL-033, DL-035).

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

## Skills

- Skills are generated from canonical templates in `templates/skills/` (DL-031). Edit the templates only and run `npm run generate`; never edit `skills/` or `.claude/skills/` by hand. `npm run check:generated` (part of `npm test` and CI) fails when the output is out of date (DL-033).
- Skills reach mechanical operations only through the bundled CLI: `{{dld}} <command>`, with `{{dld-setup}}` before the first command (DL-036). No shell scripts in skills; new mechanical behaviour becomes a `dld` command. Other supporting files are referenced with `{{script <skill>/<path>}}`, never a literal path.
- Skills that ask the user anything use the `AskUserQuestion` tool rather than waiting for freeform replies.
- SKILL.md lists the `dld` commands it uses, checks prerequisites before doing work, and ends by suggesting next steps.
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
