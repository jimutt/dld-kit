# System Snapshot

> Auto-generated from the decision log on 2026-11-01. Do not edit manually.
> Use `/dld-snapshot` to regenerate. Source of truth: individual decision records.
>
> **Active decisions:** 69 (DL-001 through DL-070, excluding superseded/deprecated)
> **Proposed decisions:** 0 (listed after the active ones, under "(proposed)" headings)

---

## Toolchain (v1-toolchain)

### DL-001: Node 20+ is the runtime; Bun is a development tool only

Node.js 20 or newer is the only supported runtime for everything shipped. Compile to ESM targeting the language level Node 20 supports (ES2023).

Bun is used for development only: running tests and local scripts. Code under `src/` must not use Bun-specific APIs (`Bun.*`, `bun:*` imports) — only Node built-ins (`node:fs`, `node:path`, `node:child_process`, …) and standard JavaScript. The built CLI is always exercised under `node` in CI, so a Bun-only behaviour cannot reach users unnoticed.

Enforcement: `tsconfig.src.json` typechecks `src/` (excluding tests) with Node types only, so `Bun.*` or `bun:*` in shipped code fails `npm run typecheck`. `@types/node` is pinned to the 20.x line so APIs newer than the runtime floor also fail to typecheck.

**Rationale:** Node is the runtime package managers and harnesses assume, and Node 20 is the oldest line still broadly deployed. Bun keeps the development loop fast, and restricting `src/` to Node APIs means it can be swapped out without touching shipped code.

**Code:** `tsconfig.src.json`, `scripts/build.mjs`, `package.json`

---

### DL-002: Publish as the npm package dld-kit with a dld command
*Amended by: DL-042, DL-056*

Publish the unscoped npm package `dld-kit`. It installs one command, `dld` (`bin: { "dld": ... }`).

`package.json` declares `"type": "module"`, `"engines": { "node": ">=20" }`, and an explicit `files` allowlist so only built output, skills, and docs ship — never tests, sources of test fixtures, or development config.

For 1.0 the CLI (commands, flags, exit codes, output formats consumed by skills) is the public contract and follows semver. The library is importable but its API is not committed until a later decision says so; it is documented as internal.

**Rationale:** `dld-kit` matches the repo and existing identities, and a short `dld` command matters more than a short package name. An explicit `files` list keeps the tarball clean, and committing only to the CLI leaves internals free to change.

**Code:** `package.json`, `src/bin.ts`, `scripts/check-pack.mjs`

---

### DL-003: Build with tsc for types and esbuild for a single-file bundle

- `tsc` is used for typechecking (`tsc --noEmit` in CI) and, when needed, emitting `.d.ts` declarations. It does not produce the runtime JavaScript.
- esbuild bundles the CLI entry point into one ESM file, `dld.mjs`, targeting `node20`, with all dependencies inlined and Node built-ins left external. The output starts with a `#!/usr/bin/env node` shebang.
- That same bundle is both the npm `bin` target and the file copied into the skills. There is one build artifact, not two.
- The build is a single script (`npm run build`), runnable under Node.

**Rationale:** esbuild is a fast, single-dependency bundler for a Node ESM single file, and tsc stays authoritative on types. One artifact for npm and the skills means users run the same code however they installed it.

**Code:** `scripts/build.mjs`, `package.json`

---

### DL-004: Test with bun unit tests and node CLI integration tests; bats until the port completes

Three layers, all required to pass:

1. **Unit tests** — `bun test`, colocated as `*.test.ts` beside the code they cover. They test library functions with injected dependencies (filesystem, git, clock, process execution).
2. **CLI integration tests** — run the built `dld.mjs` bundle with `node` as a subprocess against temporary git projects, asserting stdout, stderr and exit codes. These cover the command surface, not every branch.
3. **bats** — the existing suite stays until every script is ported. During the port, bats tests are pointed at `dld` subcommands; a script is removed only when its bats tests pass against the CLI. After the port the bats suite is retired, with any coverage not already in layers 1–2 moved there first.

Tests never touch the developer's real repository.

**Rationale:** Colocated bun tests keep the unit loop fast, and running the bundle under Node guards against Bun/Node differences and bundling mistakes. Bats served as the oracle that made the port mechanically checkable.

**Code:** `tests/cli/cli.test.ts`, `src/cli/index.test.ts`, `package.json`

---

### DL-005: CI runs typecheck, lint, all test layers on Node 20 and 22, and a package dry-run
*Amended by: DL-020, DL-059*

The GitHub Actions workflow runs on pull requests and on pushes to `main` and `v1`, with these steps:

- install dependencies from the lockfile (frozen)
- Biome check (lint and format)
- `tsc --noEmit`
- `bun test`
- build, then the CLI integration tests under `node` on a Node 20 and Node 22 matrix
- the bats suite (until retired)
- `npm pack --dry-run`, failing if the tarball contains files outside the `files` allowlist or is missing the built CLI

Dependencies install with `bun install --frozen-lockfile` from `bun.lock`, with the Bun version pinned in the workflow.

**Rationale:** Node 20 is the floor and Node 22 the current LTS, so testing both covers the edges of the support range. A pack dry-run catches publishing mistakes when they are cheapest to fix.

**Code:** `.github/workflows/test.yml`, `scripts/check-pack.mjs`

---

### DL-006: Biome for linting and formatting

Use Biome as the single linter and formatter, configured in one `biome.jsonc` at the repo root (JSONC, so it can carry comments), scoped to the TypeScript sources, CLI tests, build scripts and root JSON files. `biome check` runs in CI and fails the build on errors; `biome check --write` is the local fix command. Use Biome's recommended rules as the starting point and deviate only with a comment explaining why.

**Rationale:** One fast tool and one config replace ESLint, Prettier and plugins, and deterministic formatting removes formatting from reviews and agent diffs.

**Code:** `biome.jsonc`

---

## CLI core (v1-core)

### DL-007: Split the code into src/core (library) and src/cli (command layer)

- `src/core/` holds the logic: config, paths, IDs, and later records, index, annotations, audit, snapshot, reindex. Core functions take their inputs and an injected context, and return values or throw `DldError`. Core never writes to stdout or stderr, never reads `process.argv` or `process.env` directly, and never calls `process.exit` or sets `process.exitCode`.
- `src/cli/` holds the command layer: dispatch, one module per command, argument parsing, output formatting, and mapping errors to exit codes. `src/cli.ts` moves to `src/cli/`.
- `src/bin.ts` stays the only entry point that touches `process`. It builds the real context and calls the CLI.
- The real `Context` implementation (DL-008) lives in `src/node-context.ts`, outside both `core` and `cli`, so core never imports `node:fs` or `node:child_process` and tests can build the same context against a temporary project.
- `run()` takes the command list as a parameter (defaulting to the registered commands), so dispatch and error handling are testable with probe commands.
- Core does not import from `src/cli/`.

**Rationale:** A library that never prints or exits can be unit-tested directly and reused by setup commands and the generator. One module per command keeps changes small, and confining `process` access to one file keeps runtime differences easy to reason about.

**Code:** `src/cli/index.ts` → `run`, `src/bin.ts`, `src/node-context.ts`

---

### DL-008: Pass filesystem, git and environment to core through an injected Context
*Amended by: DL-015, DL-016*

Core functions receive a `Context` object:

- `cwd` — the directory the command runs from.
- `fs` — a narrow synchronous filesystem interface covering only what core uses. It starts with `exists`, `isDirectory`, `readFile` and `readDir`; writes, `mkdir` and `rename` arrive with the first command that needs them. The real implementation wraps `node:fs`.
- `git(args)` — runs `git` in `cwd` and returns stdout. A non-zero exit throws `GitCommandError` (a `DldError` carrying git's stderr); a missing `git` binary throws a `DldError` saying so. The real implementation uses `node:child_process` `execFileSync`.
- `env` — a read-only view of environment variables.

The interface grows only when a ported command needs a new operation. I/O is synchronous.

Tests use the real implementations against temporary git projects for the normal paths, and hand-written fakes (e.g. an fs whose `writeFile` throws) for failure branches. No mocking library.

**Rationale:** One narrow injected object is easy to thread through calls and to fake in tests. Synchronous I/O suits a short-lived CLI, and `execFileSync` with argument arrays avoids shell quoting problems.

**Code:** `src/core/context.ts` → `Context`, `src/node-context.ts` → `createNodeContext`

---

### DL-009: Load dld.config.yaml with the bundled yaml package into a typed, validated Config
*Amended by: DL-023, DL-067*

- Parse the file with the `yaml` npm package. YAML errors and warnings (e.g. an unresolved custom tag) are config errors; the parser never prints. It is a devDependency, bundled into `dist/dld.mjs` by esbuild, so the published package keeps no runtime dependencies.
- Validate the parsed value into a typed `Config` object, without type assertions (PRACTICES.md):
  - `decisions_dir` (string, required)
  - `mode`: `flat` or `namespaced` (required)
  - `namespaces` (string list, required non-empty when `mode` is `namespaced`)
  - `annotation_prefix` (string, default `@decision`)
  - `implement_review` (boolean, default `true`)
  - `snapshot_artifacts` (list of `{title, prompt}`, default empty)
- Unknown keys are ignored.
- A missing config file fails with the same message the scripts print: `dld.config.yaml not found. Run /dld-init first.`
- Any other invalid value fails with a message naming the key and the expected shape.
- Core exposes the derived paths: the decisions directory and the records directory. Per-namespace paths are added when the first command needs them.

**Rationale:** A real YAML parser handles quoting, comments and block scalars as users expect, at a bundle-size cost that does not matter here. Validating up front turns a malformed config into one clear error.

**Code:** `src/core/config.ts` → `parseConfig`, `src/core/config.test.ts`, `package.json`, `scripts/build.mjs`

---

### DL-010: Resolve the project root with git rev-parse --show-toplevel

The project root is the output of `git rev-parse --show-toplevel`, run in the context's `cwd`. Outside a git repository, commands fail with `Error: not a git repository`. `dld.config.yaml` is read from the project root only.

**Rationale:** Git is already a hard requirement for reindex and audit, and resolving from any subdirectory to the same root is what users expect.

**Code:** `src/core/project.ts` → `findProjectRoot`, `src/core/project.test.ts`

---

### DL-011: Name CLI commands after the scripts they replace until the port is complete
*Amended by: DL-017, DL-056*

- Each ported script becomes a `dld` subcommand named after the script without `.sh`: `dld next-id`, `dld update-status DL-003 accepted`, `dld create-decision --id ... --body-stdin`.
- Positional arguments, flags, stdout, stderr and exit codes match the script. Where a behaviour difference is intended, it is recorded as a decision.
- Arguments are parsed with `node:util` `parseArgs` (strict mode), wrapped in a small helper that turns its errors into usage errors.
- Every command supports `-h`/`--help`, anywhere in its arguments before `--`.
- Commands reject arguments they do not accept (a usage error), where some scripts silently ignored them. The bats tests never pass such arguments, so this does not break parity with them.
- Script failures that did not propagate are not reproduced. For example, `next-id.sh` with no config or outside git prints the error, then `DL-001`, and exits 0, because the failure happens inside a command substitution. `dld next-id` exits 1 with only the error.
- `dld --help` lists the available commands.
- Renaming or regrouping commands (e.g. `dld decision create`) happens only after every script is ported. It needs its own decision.

**Rationale:** One-to-one names made each port and the SKILL.md switch mechanical, `parseArgs` adds no dependency, and deferring renames avoided churning the skills twice.

**Code:** `src/cli/command.ts` → `parseCommandArgs`, `src/cli/commands/next-id.ts` → `nextIdCommand`

---

### DL-012: Report errors on stderr with exit 1, usage errors with exit 2, and tolerate closed pipes

- Core throws `DldError` for expected failures. It carries a message and an optional exit code (default 1).
- The CLI catches `DldError`, writes `Error: <message>` to stderr and returns its exit code.
- Parse failures and unknown commands return exit 2 with usage text on stderr. A command's usage error is printed as `dld <command>: <message>` followed by that command's usage.
- Any other exception is a bug. It is reported as `dld: unexpected error (this is a bug)` with its stack trace, and exit 1.
- "Nothing found" is not an error by default. Commands whose scripts use a distinct exit code for it keep that code, chosen per command when ported.
- `EPIPE` on stdout or stderr ends the process quietly with the exit code already set, without a stack trace.
- Filesystem failures (permission denied, a directory where a file was expected) are environment problems. The real `Context` reports them as `DldError` naming the path.

**Rationale:** Matching the scripts' `Error:` prefix and exit codes keeps skill expectations valid, separating expected errors from bugs keeps messages clean, and closed pipes are normal when agents truncate output.

**Code:** `src/core/errors.ts` → `DldError`, `src/node-context.ts`, `src/cli/index.ts` → `run`, `src/bin.ts`, `tests/cli/cli.test.ts`

---

## Shared library (v1-port-common)

### DL-014: Parse decision records with yaml, edit their metadata line by line, and render new records from a fixed template

- **Reading.** Core splits a record into frontmatter and body at the first two lines that are exactly `---`. It parses the frontmatter with the `yaml` package (DL-009) and validates it into a typed `DecisionRecord`: `id`, `title` and `status` required; `timestamp`, `supersedes`, `amends`, `namespace`, `tags` and `references` optional with empty defaults.
- **Legacy frontmatter.** `create-decision.sh` wrote titles without escaping, so existing records can contain frontmatter that is not valid YAML (e.g. `title: "Use "yaml" package"`). When the YAML parse fails, fields are read line by line the way `regenerate-index.sh` read them: the first `<field>:` line, surrounding quotes stripped, `[a, b]` lists split on commas, no `references`. The result is validated like any other record. A record that still fails validation fails with an error naming the file.
- **Editing metadata.** Changes to existing records are line-level edits inside the frontmatter block. For example, `update-status` replaces the single `status:` line. Every other byte of the file, including the body and the user's formatting and comments, is left unchanged. Core never re-serialises a whole frontmatter block.
- **Creating.** New records are rendered from a fixed template with the same line order and layout as `create-decision.sh`. A title is written double-quoted, with `\`, `"` and control characters (newline, tab, ...) escaped, so every record `create-decision` writes parses back to the same title.
- Status values are the ones the scripts accept: `proposed`, `accepted`, `deprecated`, `superseded`.
- `create-decision` accepts only IDs of the form `DL-<digits>`, and a namespace that is a plain name (letters, digits, `.`, `_`, `-`; not `.` or `..`). The script accepted anything, so an ID or namespace could point outside the records directory.
- `update-status` fails if the frontmatter has no `status:` line. The script reported success without changing anything.

**Rationale:** A real parser reads frontmatter correctly where `grep | sed` breaks, while line-level edits keep diffs to the one changed line instead of reformatting hand-edited records. A fixed template keeps new records identical to the scripts' output.

**Code:** `src/core/records.ts` → `parseRecord`, `setStatus`, `renderNewRecord`, `src/core/decisions.ts`, `src/core/records.test.ts`

---

### DL-015: Write files atomically through new Context operations, and create new files exclusively
*Amends: DL-008*

- `Context.fs` gains `writeFile`, `mkdir` (recursive), `rename`, `link` and `remove` (which ignores a missing file). The real implementation reports filesystem failures as `FsError`, a `DldError` that names the operation and path and carries the errno code (DL-012).
- Core writes files only through two helpers built on those operations:
  - `writeFileAtomic(path, content)` writes a temp file in the same directory, then renames it over the target. It is used for files that are replaced, such as INDEX.md and records edited by `update-status`.
  - `createFileExclusive(path, content)` writes a temp file, hard-links it to the target, then removes the temp file. The link fails if the target exists, which is reported as the command's "already exists" error. It is used for new files such as `dld.config.yaml` and new records.
- If a write fails, the temp file is removed. A failure to remove it is ignored, so the original error is the one reported.

**Rationale:** Temp file plus rename means a reader never sees a half-written file, and a hard link closes the race between checking for a file and creating it. Named helpers make the write strategy visible at every call site.

**Code:** `src/core/files.ts` → `writeFileAtomic`, `createFileExclusive`, `src/core/context.ts` → `FileSystem`, `src/node-context.ts` → `nodeFileSystem`, `src/core/files.test.ts`

---

### DL-016: Give Context standard input and a clock
*Amends: DL-008*

- `Context` gains `readStdin(): string`. It returns all of standard input as UTF-8 and is called only by commands that were asked to read it. The real implementation reads file descriptor 0 synchronously.
- `Context` gains `now(): Date`. Timestamps are formatted as `YYYY-MM-DDTHH:MM:SSZ` (UTC, no milliseconds), matching `date -u +"%Y-%m-%dT%H:%M:%SZ"` in the scripts.
- Tests pass a fixed string and a fixed date.

**Rationale:** Reading stdin only on demand avoids blocking on a terminal, and an injected clock makes record output deterministic in tests.

**Code:** `src/core/context.ts` → `Context`, `src/node-context.ts` → `createNodeContext`, `src/core/decisions.ts` → `createDecision`

---

### DL-017: Handle -h/--help inside parseCommandArgs instead of scanning raw arguments
*Amends: DL-011*

- Before its strict parse, `parseCommandArgs` runs a non-strict `parseArgs` pass with `tokens: true` over the command's own options plus `-h`/`--help`. Help is requested only if a token is the `help` option; option values and arguments after `--` are not.
- If help is requested, it throws a signal that the dispatcher turns into the command's usage on stdout with exit 0. Commands never see the flag, and their own option types are unchanged.
- Strict parsing also means an option value that starts with `-` must be attached with `=` (`--title=-x`). The scripts accepted `--title -x`.
- `--title=--help` is a value. `--title --help` is not a help request either: the strict parse rejects a value that looks like an option, so it is a usage error.
- The raw-argument scan in the dispatcher is removed.

**Rationale:** Only the parser knows which tokens are option values, so help detection belongs there, and adding it centrally keeps every command consistent.

**Code:** `src/cli/command.ts` → `parseCommandArgs`, `src/cli/index.ts` → `run`, `src/cli/index.test.ts`

---

### DL-018: Render INDEX.md with a single renderer that matches regenerate-index.sh byte for byte

- One core function renders INDEX.md from a list of records and the project mode. Both `create-empty-index` (empty list) and `regenerate-index` use it.
- Output matches the scripts byte for byte for well-formed records:
  - A `# Decision Log` heading and a blank line.
  - The flat or namespaced table header.
  - One row per record, ordered by numeric ID descending, with tags joined by `, `.
  - A trailing newline.
- `--include-base <ref>` is ported. Record files under the records directory on the ref are listed with `git ls-tree` and read with `git show`. A base record is included only when no local record has the same file name. An unknown ref fails with the scripts' "not found" error.
- The file is written with `writeFileAtomic` (DL-015).
- `regenerate-index` fails if the records directory is missing, as the script does.
- A record that cannot be parsed fails the command with an error naming it: its path relative to the project root, or `<ref>:<path>` for a base record.

**Rationale:** Skills, users and the reindex flow depend on the exact INDEX.md layout, and one renderer removes duplicated header logic.

**Code:** `src/core/index-file.ts` → `renderIndex`, `collectIndexRows`, `src/cli/commands/regenerate-index.ts`, `src/cli/commands/create-empty-index.ts`, `src/core/index-file.test.ts`

---

### DL-019: Scan for annotations with one core scanner over git's file list and a single exclusion list
*Amended by: DL-023, DL-060, DL-069*

- Core has one annotation scanner, used by `verify-annotations` now and by `find-annotations` when it is ported.
- The file list comes from `git ls-files --cached --others --exclude-standard`: tracked files plus untracked files that `.gitignore` does not ignore.
- On top of that, one exclusion list applies. It is the union of both scripts' lists: `.git`, `.claude`, `.tessl`, `node_modules`, `vendor`, `.venv`, `__pycache__`, `target`, `dist`, `build`, `out`, `.next`, `.gradle`, `coverage`. Minified files, lockfiles and source maps are also skipped.
- The decisions directory is excluded by its full path from the project root.
- Only regular files are read, checked without following symlinks: listed paths that no longer exist (tracked files deleted from the working tree), directories (submodules) and symlinks are skipped. `Context.fs` gains `isRegularFile` for this.
- Binary files (a NUL byte in the first 8 KB) are skipped.
- The annotation is matched literally as `<annotation_prefix>(DL-<digits>)`. The prefix is not treated as a regular expression.

**Rationale:** Git's file list respects the project's own ignores and skips build output, and one scanner means `verify` and `audit` can never disagree about whether an annotation exists.

**Code:** `src/core/annotations.ts` → `scanAnnotations`, `listScannableFiles`, `src/cli/commands/verify-annotations.ts`, `src/core/annotations.test.ts`

---

### DL-020: Report unit-test coverage on PRs with a self-hosted comment and a 90% floor
*Amends: DL-005*

- **Scope.** Coverage is measured for the unit tests over `src/` only. Test files and `src/test-helpers.ts` are excluded. The CLI tests (a bundle run under Node) and bats (bash, being retired) are not measured.
- **Configuration.** A `bunfig.toml` sets the text and lcov reporters, the output directory and exclusions. `npm run test:coverage` runs the unit tests with coverage.
- **Floor.** `coverageThreshold` is 90% for lines and 90% for functions. Bun applies it to each file, not just the total. The coverage run fails if any file is below it, which fails CI; the report still renders and flags the files below the floor.
- **PR report.** A `coverage` job:
  - runs the unit tests with coverage on the PR head;
  - runs them again on the PR's base commit (`pull_request.base.sha`), checked out in a git worktree;
  - renders totals, per-file lines and functions, and the change from base with `scripts/coverage-report.mjs` into markdown;
  - writes the markdown to the job summary;
  - posts it as a single PR comment, found by a hidden marker and updated on every push.
  If the base has no coverage setup, the report says so and shows the head only.
- **Permissions.** Only the coverage job gets `pull-requests: write`; the rest of the workflow keeps `contents: read`. Its checkout does not persist the token, so the PR's own code never runs with it on disk. The comment step is skipped for PRs from forks, whose token cannot write, and only updates a comment written by `github-actions[bot]`. The job summary still appears.
- The base run, report and comment steps run even when the coverage step fails, but not when the workflow is cancelled.
- No third-party coverage service.

**Rationale:** Unit coverage is where coverage is meaningful and cheap, a 90% floor catches untested code without being an obstacle, and a self-hosted comment needs no account or secret.

**Code:** `bunfig.toml`, `scripts/coverage-report.mjs`, `.github/workflows/test.yml`, `package.json`

---

## Audit and snapshot commands (v1-port-audit)

### DL-021: Read and update .dld-state.yaml section by section with the yaml Document API and the failsafe schema
*Amended by: DL-070*

- Core reads `.dld-state.yaml` with the `yaml` package's Document API using the **failsafe** schema, so every scalar is a string and commit hashes survive intact. A missing file is an empty state. A file that is not valid YAML, holds more than one YAML document, or is not a mapping fails with an error naming it, so an update can never drop content it could not read.
- Updates replace a single top-level section (`audit` or `snapshot`) in the parsed document and leave every other section, and comments outside the replaced section, in place. The document is serialised back and written with `writeFileAtomic` (DL-015).
- Section layout and field names stay as the scripts write them:
  - `audit: {last_run, commit_hash}`
  - `snapshot: {last_run, commit_hash, decisions_included, artifacts: {<name>: <timestamp>}}`
  Timestamps come from `Context.now()` in the DL-016 format. `commit_hash` is `git rev-parse --short HEAD`, or `unknown` when HEAD does not resolve.
- Readers take values as strings and convert them where needed: `decisions_included` is a decimal number, and `unknown` or empty means "no commit".

**Rationale:** The failsafe schema is the only way to keep leading zeros in commit hashes, and editing the parsed document per section keeps other tools' sections intact.

**Code:** `src/core/state.ts` → `writeStateSection`, `readStateSection`, `src/core/state.test.ts`

---

### DL-022: Port find-annotations onto the shared scanner, reporting only IDs inside annotations

- `dld find-annotations` prints the shared scanner's results as `<file>:<line>:<DL-NNN>`, one line per annotation, with paths relative to the project root and `/` separators. Output is sorted by file, then line, then position on the line. No annotations means no output and exit 0.
- Only IDs inside an annotation (`<prefix>(DL-NNN)`) are reported. Plain `DL-NNN` mentions on the same line are not.
- It inherits the scanner's file selection (DL-019): gitignored files are skipped, and so are paths excluded by configuration (DL-023).

**Rationale:** Reporting plain mentions made the audit treat prose like "replaces DL-005" as a code reference; sharing the scanner keeps `find-annotations` and `verify-annotations` in agreement.

**Code:** `src/core/annotations.ts` → `scanAnnotations`, `src/cli/commands/find-annotations.ts`

---

### DL-023: Let projects exclude paths from annotation scanning with an annotation_exclude config key
*Amends: DL-009, DL-019*

- `dld.config.yaml` gains an optional `annotation_exclude` key: a list of git glob patterns relative to the project root, e.g. `docs/**`, `README.md`, `tests/**/*.bats`. It defaults to an empty list. A non-list, a non-string entry, or a pattern that is absolute or starts with `..` is a config error (DL-009).
- The scanner passes each pattern to `git ls-files` as a `:(exclude,glob)<pattern>` pathspec, so matching follows git's glob rules: `*` stays within a directory, `**` crosses directories, and a pattern that matches a directory excludes everything beneath it.
- The exclusions apply wherever the scanner is used: `find-annotations` and `verify-annotations`.
- dld-kit's own `dld.config.yaml` sets it for its documentation and README, SKILL.md examples, bats fixtures and unit-test fixtures (`src/**/*.test.ts`). That drops 58 example matches and leaves only the real annotations.
- `docs/framework/project-configuration.md` documents the key.

**Rationale:** Excluding paths fixes example-annotation false positives once instead of renumbering examples as the log grows. Git pathspecs give documented glob semantics with no glob code of our own.

**Code:** `src/core/config.ts` → `parseConfig`, `src/core/annotations.ts` → `listScannableFiles`, `dld.config.yaml`, `docs/framework/project-configuration.md`

---

### DL-024: Port find-missing-amends with parsed records and the same changed-since-audit filter

- Records are read with the DL-014 parser. Declared IDs are `supersedes` plus `amends`. The body is everything after the closing `---` of the frontmatter.
- A candidate is every distinct `DL-<digits>` in the body that is neither the record's own ID (from its file name, as the script used) nor declared. Declared IDs match exactly; the script's substring check treated `DL-01` as declaring `DL-012`. Output is `<source-id>:<referenced-id>`, sorted by source ID number, then referenced ID number.
- The changed-since-audit filter keeps the script's semantics:
  - It applies only without `--all` and when the audit commit is recorded, is not `unknown`, and resolves in the repository.
  - Changed means listed by `git diff --name-only <commit> -- <records dir>` (committed and working-tree changes) or untracked under the records directory.
  - If the commit is missing or unreachable, every record is checked.
- Records at any depth under the records directory are checked.
- Paths from git are read with `-z`, so records under non-ASCII paths are matched. The script compared git's quoted paths and silently missed them.
- The stored commit is used only if it is a hex hash that `git rev-parse --verify` resolves to a commit; anything else means every record is checked.
- Every record is parsed and validated, including ones that are not checked for mentions. An invalid record fails the command with an error naming it, as `regenerate-index` does (DL-018).

**Rationale:** The shared parser reads declared relationships the same way everywhere, and the changed-since-audit filter stops already-reviewed references from resurfacing every audit.

**Code:** `src/core/audit.ts` → `findMissingAmends`, `src/cli/commands/find-missing-amends.ts`, `src/core/audit.test.ts`

---

### DL-025: Port the snapshot scripts with their current semantics and deterministic ordering
*Amended by: DL-070*

- **collect-active-decisions:** accepted records only (status from the DL-014 parser), ascending by ID number, each record's file content unchanged, separated by a `===DLD_DECISION_BOUNDARY===` line. It fails if the records directory is missing, as the script does.
- **detect-snapshot-changes:** keeps the script's rules and output lines:
  - `mode: full` when there is no state file, no `snapshot` section, no `decisions_included`, or `SNAPSHOT.md` or `OVERVIEW.md` is missing.
  - Otherwise `mode: incremental`, followed by `new_decisions`, `modified_decisions` and `commit_range` lines.
  - New decisions are accepted records numbered above `decisions_included`.
  - Modified decisions are records numbered at or below it and changed in `<commit>..HEAD` (committed changes only).
  - If `commit_hash` is missing or `unknown`, the baseline is the last commit at or before `last_run`.
  - IDs are formatted `DL-%03d`, joined with `, `, and listed in ascending order.
  - A `decisions_included` that is not a whole number is treated like a missing one (`mode: full`); the script failed on it with a shell arithmetic error.
  - A failing `git log` or `git diff` counts as no output, as the script's `|| true` did.
  - The baseline commit is used only if it is a hex hash that resolves to a commit, and changed paths are read with `-z` so non-ASCII paths are recognised.
- **update-snapshot-state:** sets `decisions_included` to the highest accepted ID number and records `SNAPSHOT.md`, `OVERVIEW.md` and any artifact names passed as arguments, through DL-021. It prints the script's confirmation line.

**Rationale:** The snapshot skill parses these outputs, so parity let the skill switch to the CLI unchanged; sorting makes the output stable without changing its meaning.

**Code:** `src/core/snapshot.ts` → `collectActiveDecisions`, `detectSnapshotChanges`, `updateSnapshotState`, `src/core/snapshot.test.ts`

---

## Reindex commands (v1-port-reindex)

### DL-026: Scan open PRs through Context.gh and report every skipped scan
*Amended by: DL-065*

- `Context` gains `gh(args)`, shaped like `git(args)`: it runs `gh` in `cwd` and returns stdout. A non-zero exit throws a `DldError` subclass carrying gh's stderr. A missing `gh` binary throws a distinct error type, so core can tell "not installed" from "failed". The real implementation uses `execFileSync` with a timeout (60 seconds) and `GH_PROMPT_DISABLED=1`; a timeout is reported as a failure.
- The open-PR scan keeps the script's skip reasons, checks and notice text, in the same order. Whether gh is installed is checked with `gh --version`; the GitHub-remote check reads `git remote get-url origin`.
- The PR whose head is the current branch of this repository is not counted: a PR is skipped when it is not cross-repository and its `headRefName` equals the current branch (`--json files,headRefName,isCrossRepository`). Fork PRs with the same branch name are still counted. The script counted the branch's own open PR, so every record it added collided with itself.
- The base is passed to gh as `--base=<branch>`, so it cannot be read as an option.
- `gh pr list` is called without `--jq`; core parses the JSON itself and reads `files[].path` from each PR, tolerating PRs with no `files`. Paths are kept when they start with the records directory (root-relative, `/`-separated) followed by `/`, compared literally rather than as a regular expression.
- When `gh pr list` fails, times out or returns output that is not the expected JSON, the scan is skipped with the same notice and a reason naming the failure (e.g. `gh pr list failed: <first line of stderr>`). Base-branch IDs are still printed and the exit code stays 0.
- Core returns the skip reason; the CLI prints the notice (DL-007).
- Tests use a fake `gh` in the Context for every branch: not installed, not a GitHub remote, not authenticated, list failure, malformed JSON, and a successful scan.

**Rationale:** A narrow `gh` method keeps process execution out of core, parsing JSON in TypeScript makes it testable, and reporting a failed PR scan is the only way the user knows how safe the chosen IDs are.

**Code:** `src/core/open-prs.ts` → `openPrIds`, `src/core/context.ts` → `Context.gh`, `src/node-context.ts` → `nodeGh`, `src/core/errors.ts` → `GhCommandError`, `src/core/open-prs.test.ts`

---

### DL-027: Port the reindex planning commands on one core computation
*Amended by: DL-065*

- The four become `dld resolve-base`, `dld list-taken-ids`, `dld find-collisions` and `dld plan-renames` (DL-011), backed by one core module. Taken IDs, local additions and collisions are computed once per command, so `gh` runs at most once and the notice prints at most once. When the branch adds no records, the open-PR scan is not run at all.
- `resolve-base` keeps the script's logic and, like the script, works without `dld.config.yaml` and prints `origin/main` when git cannot answer.
- The default base stays `origin/main`. A base that starts with `-` is a usage error in the CLI, and core (`verifyBase`, which every reindex operation calls) rejects it too. A base that does not resolve to a commit fails with the script's message (`list-taken-ids` keeps its "Fetch first or pass --base." suffix).
- Paths from git are read with `-z` (DL-024), so records under non-ASCII paths are found.
- `list-taken-ids` output is sorted by ID number rather than as text.
- `plan-renames` orders collisions by ID number, then path. New IDs start at one above the highest ID taken or added locally (0 if none), increase by one, and are formatted with `formatId` (DL-014), so they keep at least three digits.
- Output formats are unchanged: tab-separated fields, one entry per line, nothing when there is nothing to report.

**Rationale:** Computing once removes repeated `gh` calls and duplicated notices, and numeric ordering keeps plans sensible past DL-999.

**Code:** `src/core/reindex.ts` → `planRenames`, `resolveBase`, `src/cli/commands/base-option.ts` → `baseOption`, `src/cli/commands/plan-renames.ts`, `src/core/reindex.test.ts`

---

### DL-028: Validate the rename plan before acting on it
*Amended by: DL-064*

- The plan format is unchanged. Empty lines and lines of only whitespace are ignored, and a trailing `\r` is dropped; a plan with no entries counts as empty (`find-stale-mentions` prints nothing and exits 0, `commit-reindex` fails with its "no rename plan on stdin" message, as now).
- Every entry is validated before any work is done, and the first problem fails the command with an error naming the line number:
  - exactly three tab-separated fields;
  - both IDs match `DL-<digits>` and differ;
  - the path is root-relative and `/`-separated, contains no `.` or `..` segment, lies under the records directory, and its file name is `<DL-OLD>.md`;
  - no path, old ID or new ID appears twice, and no new ID is also an old ID in the same plan.
- `rename-decision`'s `--old`, `--new` and `--path` are checked with the same rules, and additionally the record at `--path` must be a regular file whose frontmatter `id` is `--old` (DL-014 parser).
- Parsing and validation live in core, shared by all three commands.

**Rationale:** `commit-reindex` stages exactly the paths the plan names, so confining them to the records directory and checking every line first keeps a bad plan from committing unrelated files or half-applying.

**Code:** `src/core/rename-plan.ts` → `parseRenamePlan`, `renameProblem`, `src/core/rename-plan.test.ts`

---

### DL-029: Port rename-decision and find-stale-mentions with the scanner file filter and byte-preserving rewrites

- `dld rename-decision` and `dld find-stale-mentions` keep the scripts' arguments, output and the merge-base change set (`--base` defaults to `origin/main` for `rename-decision` and is required for `find-stale-mentions`, as now). Change sets are read with `git diff -z`.
- The rename itself is `git mv -- <path> <new path>`, after the checks in DL-028. The `id:` line is rewritten as a single-line frontmatter edit (DL-014), then the digit-aware substitution runs over the whole file.
- Changed files under the decisions directory get the digit-aware substitution of `DL-OLD`, as in the script.
- Annotation rewrites apply to changed files that the annotation scanner would read (DL-019, including `annotation_exclude` from DL-023). An annotation in an excluded file is an example, not a reference, and is not renumbered.
- `find-stale-mentions` searches every changed file outside the decisions directory, including excluded ones, so example mentions are shown to the agent to judge rather than silently kept or changed.
- Both commands only read and write regular files, not following symlinks, and skip binary files (a NUL byte in the first 8 KB, as DL-019).
- Rewrites change only the replaced IDs: other bytes, line endings and the file mode are preserved, and a file is written only if something in it changed. Writes use temp file plus rename (DL-015). Files are decoded byte-for-byte (latin1) for the substitution, and the annotation prefix is matched as its UTF-8 bytes. `Context.fs` gains `readBytes`, `fileMode` and `chmod` for this.
- The merge-base and the scanner's file set are resolved before `git mv`, so a base without a merge-base fails with nothing changed.
- Records with CRLF line endings are accepted: the DL-014 frontmatter reader treats `---\r` as a delimiter.
- `find-stale-mentions` reads files as UTF-8 for display (invalid bytes show as U+FFFD; only the rewrites are byte-exact) and prints the line without its line terminator (a trailing `\r` is removed too). Output order is plan order, then change-set order, then line number.

**Rationale:** Using the scanner's file filter keeps one definition of an annotation, surfacing mentions in excluded files leaves judgment calls to the agent, and preserving bytes and modes means a rename changes nothing but the IDs.

**Code:** `src/core/rename.ts` → `renameDecision`, `findStaleMentions`, `src/core/records.ts` → `setId`, `src/core/rename.test.ts`

---

### DL-030: Port commit-reindex with literal staging and full rollback
*Amended by: DL-064*

- `dld commit-reindex --base <ref>` keeps the script's steps, messages, stage-list rules, INDEX.md exclusion and commit message format. The plan is read and validated per DL-028.
- The branch's changed files are listed with `git diff -z --no-renames --name-only --diff-filter=AMRD <merge-base>..HEAD`, so both sides of a rename are staged.
- Staging runs `git --literal-pathspecs add -A -- <path>` per path, in sorted order. A path that is neither in the working tree (lstat) nor in the index (`git ls-files`) is skipped before `git add` runs, so nothing depends on git's (translatable) error text; any `git add` failure fails the command.
- An INDEX.md that exists but is not a regular file (e.g. a symlink) is refused before anything changes. Whether INDEX.md exists at the merge-base is read with `git ls-tree`, and only exit status 1 from `git diff --cached --quiet` counts as "there are staged changes" (`GitCommandError` carries git's exit status).
- The commit is made with `git commit --quiet -m <message>`, so hooks and signing configuration apply as before. A failed commit is reported with git's stderr rather than the full command line, which would repeat the message.
- Before the reset, the command saves the original HEAD, the index as a tree (`git write-tree`, which also refuses an index with unresolved conflicts before anything changes), and the INDEX.md working copy (content or absence).
- If any step after the reset fails, it restores all three: `git reset --soft <original HEAD>`, `git read-tree <saved tree>`, and INDEX.md rewritten or removed. The error names the failed step and says the branch was restored. If the rollback itself fails, the error gives the original HEAD and the saved tree so the user can restore by hand.
- Once the commit succeeds there is no rollback.
- Tests cover each failure point with a fake git in the Context (reset, add, commit, and rollback failures), plus the bats hook-based failure test and a real-repo test that the restored state matches the pre-run state exactly.

**Rationale:** The command moves the branch, so a failure must leave branch, index and INDEX.md exactly as they were. `--no-renames` and literal pathspecs keep the staged set identical to the plan.

**Code:** `src/core/commit-reindex.ts` → `commitReindex`, `src/cli/commands/commit-reindex.ts`, `src/core/commit-reindex.test.ts`

---

## Skill generator (v1-generator)

### DL-031: Canonical skill templates with a single script placeholder
*Amended by: DL-036, DL-046*

- Canonical skill sources live in `templates/skills/<skill>/`: a `SKILL.md` template, plus any supporting files (today, `scripts/`), which are copied to the output unchanged, keeping their file mode.
- A template's frontmatter holds the harness-neutral fields: `name`, `description`, `compatibility`, and an optional `internal: true` for skills that only provide shared files (`dld-common`). Adapters decide which fields each output gets (DL-032).
- The body is Markdown with one kind of placeholder: `{{script <skill>/<path>}}`, for example `{{script dld-common/scripts/next-id.sh}}`. The adapter renders it as the path that harness's copy of the skill uses for that file.
- The syntax is deliberately minimal: no conditionals, loops, includes or escaping rules, and no template library. Any `{{` followed (after optional spaces) by `script` must be a well-formed placeholder whose path has no `.` or `..` segments and names a file some template provides; otherwise generation fails with an error naming the template and line. Other `{{...}}` text is copied as written: dld-implement's review prompt uses `{{project_name}}`-style fields the agent fills in.
- Frontmatter is one `key: value` line per field and must be valid YAML. `name` must match the directory. Any other field fails generation. Each line is copied to the output as written, so quoting and formatting are preserved.
- Supporting files are every file in the skill's template directory except SKILL.md; names starting with `.` are skipped. Templates must be regular UTF-8 text files with LF line endings; a symlink, a non-UTF-8 file or a CRLF SKILL.md fails generation.
- The first templates are derived from the current `skills/` copy with script paths replaced by placeholders. Generating both outputs from them must reproduce the existing files apart from the intended changes (the generated-file stamp from DL-033, and the Tessl note removed by DL-034), which is how the migration is verified.
- New placeholders (for example one for invoking a `dld` command, in workstream 7) are added by their own decision when a workstream needs them.

**Rationale:** One source removes manual syncing between copies, and abstracting script references handles the variation between harnesses in one place. The placeholder syntax is small enough to validate strictly with no dependency.

**Code:** `src/generate/template.ts` → `parseTemplate`, `renderBody`, `templates/skills/`, `src/generate/template.test.ts`

---

### DL-032: Generate skills through an adapter registry in src/generate
*Amended by: DL-036, DL-039*

- `src/generate/` holds the generator and an adapter registry. Like `src/core` (DL-007), it never writes to stdout or touches `process`; it reads templates through the injected `Context` filesystem (DL-008).
- `generateSkills(ctx, templatesDir, adapter, version)` returns the complete output as an in-memory map from output-relative path to content and file mode. Modes are normalised to 0755 or 0644, which is all git records. Writing it anywhere is the caller's job.
- An adapter declares:
  - `id`, and the output directory it is normally written to;
  - the frontmatter for a skill (which template fields to keep, and which fields to add);
  - how `{{script <skill>/<path>}}` renders, given the skill being rendered;
  - whether an `internal` skill gets a SKILL.md, or only its supporting files.
- Two adapters are registered:
  - `agent-skills`, output `skills/`: frontmatter `name`, `description`, `compatibility`; a script in the same skill renders as `scripts/x.sh`, one in another skill as `../<skill>/scripts/x.sh`; internal skills get a SKILL.md.
  - `claude-code`, output `.claude/skills/`: frontmatter `name`, `description`, `user_invocable: true`; scripts render as `.claude/skills/<skill>/scripts/x.sh`; internal skills get only their supporting files, so they do not appear as invocable skills.
- The rendered paths and frontmatter are today's, unchanged; revisiting them (for example for Claude plugin installs, where skills do not live in `.claude/skills/`) belongs to workstreams 7 and 9.
- Unit tests cover each adapter's rendering and the generator's validation errors, using an in-memory filesystem for templates.

**Rationale:** An in-memory result lets the same code write `skills/`, check for drift and install into projects, and adapters stay as small as the real variation between harnesses.

**Code:** `src/generate/adapters.ts`, `scripts/generate.ts` → `OUTPUTS`, `src/generate/generate.ts` → `generateSkills`, `src/generate/generate.test.ts`

---

### DL-033: Commit generated skills and check them for drift
*Amended by: DL-043, DL-044*

- Both outputs are generated and committed: `skills/` with the `agent-skills` adapter, and this repository's `.claude/skills/` with the `claude-code` adapter.
- `npm run generate` regenerates both. It writes every generated file and deletes other files in the skill directories it owns: every skill it generates and any `dld-*` directory, so a removed or renamed skill leaves nothing behind. Other skills in the same output directory (for example a contributor's own skill in `.claude/skills/`) are never compared or deleted. Emptied directories are left in place. It runs the TypeScript generator with Bun, a development tool (DL-001); nothing shipped depends on it.
- `npm run check:generated` generates in memory and compares with the working tree byte for byte, including file modes. It lists changed, missing and extra files and exits non-zero on any difference, telling the user to run `npm run generate`. It is part of `npm test` and runs in the CI `check` job.
- Each generated SKILL.md is stamped:
  - `metadata.dld-kit-version: "<package.json version>"` in the frontmatter (the Agent Skills `metadata` field), quoted so a version like `1.0` stays a string;
  - an HTML comment after the frontmatter: `<!-- Generated by dld-kit from templates/skills/<skill>/SKILL.md. Do not edit; edit the template and run npm run generate. -->`.
- Files whose names start with `.` in the output directories (e.g. `.DS_Store`) are neither compared nor deleted.
- Supporting files (scripts) are copied without a stamp; they are replaced by the bundled CLI in workstream 7.
- CLAUDE.md and PRACTICES.md say to edit `templates/` and regenerate, never the output.

**Rationale:** Committed output keeps the skills available in every checkout, and a byte-for-byte check with extra-file detection catches hand edits, forgotten regeneration and orphaned files.

**Code:** `src/generate/generate.ts` → `diffOutput`, `writeOutput`, `scripts/generate.ts`, `.github/workflows/test.yml`

---

### DL-034: Retire Tessl packaging and the hand-maintained skill copy

- Delete `.tessl-plugin/` and `.tesslignore`.
- Move the steering rule's text to `templates/rules/dld-workflow.md` as the canonical rule text. No output is generated from it yet, and `rules/` is removed from `package.json` `files`; workstream 8 decides how it is delivered.
- Remove the Tessl note from the dld-init template.
- Replace the "Dual directory layout", "Tessl packaging" and "Shell scripts" guidance in CLAUDE.md with a description of `templates/` and the generated outputs, and update the Skills section of `decisions/PRACTICES.md` to match. The "run `tessl plugin lint`" convention is removed.
- Remove the README's Tessl install instructions and point users at the generated skills (`.claude/skills/` for Claude Code, `skills/` for other agents) until the channels in workstream 9 exist; the full install documentation is workstream 10.
- `scripts/check-pack.mjs` no longer allows `rules/` in the npm package.
- The four `plugin.json` integrity tests in `tests/test_structure.bats` are removed with the manifest they checked, as are its dual-directory sync tests, which `check:generated` replaces. The remaining structure tests run against the generated outputs; the script-path tests were rewritten so a missing script actually fails them.
- `templates/**` is added to this repository's `annotation_exclude` (DL-023), since templates contain example annotations.
- `.tessl` stays in the annotation scanner's excluded directories (DL-019): user projects may still contain it.

**Rationale:** Packaging for a dropped channel invites edits to files nothing reads, and the generator's validation replaces the Tessl lint step. The rule text was moved rather than deleted so it could be reused.

**Code:** `scripts/check-pack.mjs`, `dld.config.yaml`, `templates/rules/dld-workflow.md`, `CLAUDE.md`

---

## Skills on the bundled CLI (v1-skills-cli)

### DL-035: Skills always use the CLI bundled in dld-common

- The skills ship the bundled CLI and always use it. There is no PATH lookup and no `npx`. A globally installed `dld` (npm) remains the entry point for people, CI and `dld init`/`dld update`, never something the skills depend on.
- There is one copy per output, in the internal `dld-common` skill: `dld-common/scripts/dld.mjs`. The generator adds it to every adapter's output from `dist/dld.mjs`.
- `generateSkills` takes built files as `extraFiles` (keyed `<skill>/<path>`); a template file at the same path is an error. The bundle is written with mode 0755.
- `npm run generate` and `npm run check:generated` build `dist/dld.mjs` first (`node scripts/build.mjs`), so the committed copies always match the source. The drift check therefore also catches a `src/` change whose skills were not regenerated. The esbuild build is deterministic for pinned inputs; if it ever is not, the check fails loudly rather than drifting.
- Skills that run the CLI declare `compatibility: Requires Node.js 20+ and git.` (with the `gh` note kept for dld-reindex).

**Rationale:** Calling the CLI copy that ships with the skill removes version skew, global installs and network access at call time. One shared copy keeps each output to about 330 KB instead of several megabytes.

**Code:** `scripts/generate.ts`, `src/generate/generate.ts` → `generateSkills`, `src/generate/generate.test.ts`

---

### DL-036: A dld placeholder renders the CLI invocation per harness
*Amends: DL-031, DL-032*
*Amended by: DL-046*

- A new placeholder, `{{dld}}`, renders the CLI invocation prefix for the adapter. Templates write commands as `{{dld}} next-id`, `{{dld}} update-status DL-003 accepted`, and so on.
- A second placeholder, `{{dld-setup}}`, renders a short paragraph each CLI-using skill includes once, before its first command. It says what the commands need (Node.js 20+), where the CLI lives, and to stop and tell the user to install the `dld-common` skill if the file is missing.
- `{{dld}}` fails generation unless the bundled CLI (`dld-common/scripts/dld.mjs`) is part of the output. Any `{{` followed by `dld` or `script` must be one of the three placeholders.
- The CLI path is quoted in the rendered command, so skill directories with spaces work.
- Rendering per adapter:
  - `agent-skills`: `{{dld}}` is `node <skill-dir>/../dld-common/scripts/dld.mjs`, and `{{dld-setup}}` explains that `<skill-dir>` stands for the absolute path of this skill's directory and gives the install hint `npx skills add jimutt/dld-kit --skill dld-common`.
  - `claude-code`: `{{dld}}` is `node ${CLAUDE_SKILL_DIR}/../dld-common/scripts/dld.mjs`, so it works for project and plugin installs alike (Claude Code documents substituting it in the skill body), and the skill's frontmatter gains `allowed-tools: Bash(node "${CLAUDE_SKILL_DIR}/../dld-common/scripts/dld.mjs" *)` for skills that use `{{dld}}`. The documentation also says `${CLAUDE_SKILL_DIR}` is substituted in `allowed-tools` Bash rules, but an issue report says it was not; if it is not honoured, the rule is ignored and the command asks for permission as before. `{{script}}` renders as `${CLAUDE_SKILL_DIR}/../<skill>/<path>` for the same reason.
- The "Script Paths" sections become "Commands" sections listing the `dld` commands the skill uses. dld-status and dld-lookup run no commands; dld-status's section becomes "Files read". Command names and arguments are unchanged (DL-011); regrouping them is not part of this workstream.
- `{{script ...}}` stays available for other supporting files.

**Rationale:** One placeholder keeps templates harness-neutral, `${CLAUDE_SKILL_DIR}` gives Claude Code an exact, pre-approvable command, and detecting a missing `dld-common` turns "file not found" into an actionable instruction.

**Code:** `src/generate/template.ts` → `renderBody`, `src/generate/adapters.ts` → `claudeCodeAdapter`, `agentSkillsAdapter`, `templates/skills/`, `src/generate/template.test.ts`

---

### DL-037: Remove the bash scripts and the bats suite after a coverage audit
*Supersedes: DL-013*

- Delete every script under `templates/skills/*/scripts/` (and so from both generated outputs), including `common.sh`. `dld-common` keeps only its SKILL.md and the bundled `dld.mjs`.
- Before deleting the bats suite, audit it: map each bats test to a bun test (unit or `tests/cli`) that covers the same behaviour. Port every gap as a bun test first. The mapping is reported in the implementing PR.
- Tests that only check the scripts themselves (shell strict mode, shebangs, `common.sh` helpers with no CLI equivalent) are dropped with the scripts. The structure checks on generated SKILL.md files (references exist, frontmatter fields) are covered by the generator's validation (DL-031) and `check:generated` (DL-033); any check they do not cover is ported to a bun test.
- Delete `tests/bats` (submodule and `.gitmodules` entry), `tests/test_*.bats`, `tests/test_helper/`, `tests/run.sh`, `tests/cli-ported.txt`, `scripts/bats-cli.mjs`, the `test:bats` and `test:bats:cli` npm scripts and the CI bats job.
- This supersedes DL-013.
- Audit result (in the implementing PR): of 159 bats tests, 128 were covered by bun tests, 12 only tested the scripts (strict mode, shebangs, `common.sh` helpers, script-path references), and 19 were gaps. The gaps were ported first: verify-annotations with several IDs, create-decision without `--id`, the namespace frontmatter line, collect-active-decisions when empty and namespaced, detect-snapshot-changes with an audit-only state, a missing SNAPSHOT.md, new decisions without a baseline and an earlier last_run commit, update-snapshot-state with nothing accepted, find-missing-amends with no records and when only the referenced record changed, `regenerate-index --include-base` through the command, replacing a stale INDEX.md, consecutive renames, the flat and namespaced reindex flows end to end with a rebase (tests/cli), and `compatibility` on every real template.
- The `bats-support` and `bats-assert` submodules and `.gitmodules` go too.

**Rationale:** A second test framework and a bash dependency for code that no longer ships cost setup time and CI minutes for no coverage; the audit ensures removing the oracle loses no behavioural coverage.

**Code:** `.github/workflows/test.yml`, `tests/cli/cli.test.ts`, `src/cli/commands.test.ts`

---

### DL-038: Development docs describe the CLI-only toolkit

- CLAUDE.md: remove the "Shell scripts" section and the porting procedure; describe how skills call the CLI (`{{dld}}`, `{{dld-setup}}`, the bundled `dld-common/scripts/dld.mjs`); list the remaining test commands; drop the bats submodule note.
- PRACTICES.md: remove the "Shell scripts — until retired" and bats subsections; state that behaviour is specified by bun unit and CLI tests; add that skills invoke operations only through `{{dld}}`, never through ad-hoc scripts, and that new mechanical behaviour becomes a `dld` command.
- README: the development section drops the submodule step; requirements say Node.js 20+ instead of bash.
- `docs/framework/` and `docs/concept/` pages that describe the scripts are updated where they name a script; historical plans in `docs/plan/` are left as written.

**Rationale:** CLAUDE.md and PRACTICES.md are read on every task, so guidance describing a finished transition misleads contributors and agents.

**Code:** `CLAUDE.md`, `decisions/PRACTICES.md`, `README.md`

---

### DL-039: Drop the no-op user_invocable line from Claude Code skills
*Amends: DL-032*

- The `claude-code` adapter adds no `user_invocable` line. Its generated SKILL.md frontmatter is `name`, `description`, the `allowed-tools` rule for skills that run the CLI (DL-036), and the version stamp (DL-033).
- The adapter keeps its `extraFrontmatter` hook, now empty, for fields a harness genuinely needs.

**Rationale:** Generated output should only carry settings the harness reads; a no-op field misleads anyone copying the skills.

**Code:** `src/generate/adapters.ts` → `claudeCodeAdapter`, `src/generate/generate.test.ts`

---

## Project setup: init and update (v1-init-update)

### DL-040: Add dld init and dld update for project setup through npm

- `dld init [--namespaces <a,b,...>] [--agent <names>] [--yes]` sets up DLD in the current git repository:
  - It fails (exit 1) if `dld.config.yaml` already exists, telling the user to run `dld update`.
  - It creates `dld.config.yaml` (flat, or namespaced when `--namespaces` is given), the decisions directories and an empty INDEX.md, through the same library functions as `create-config`, `create-directories` and `create-empty-index`.
  - It installs the skills (DL-042, DL-043) and the always-on rule (DL-045) for the selected harnesses (DL-041).
  - It does not write PRACTICES.md: that takes judgment and conversation, and stays with the dld-init skill.
  - It checks its arguments, selects the harnesses and renders everything it will install before creating any file, so a failure leaves the project untouched.
  - It prints what it created, per skills directory how many files were written, and where the rule went, then the next steps, naming the dld-retrofit and dld-decide skills rather than a slash command (invocation differs per harness).
- `dld update [--agent <names>] [--force]` refreshes an initialised project:
  - It fails if `dld.config.yaml` does not exist, telling the user to run `dld init`.
  - It regenerates the skills in every skills directory that already holds `dld-*` skills and every rule channel already installed, plus those of harnesses named with `--agent`.
  - If nothing is installed and no `--agent` is given, it fails (a usage error) and lists the harness names.
  - When only the rule is installed, it needs no templates, so it also runs from the copy of the CLI inside `dld-common`.
  - It never touches `dld.config.yaml`, decision records, INDEX.md or PRACTICES.md.
  - It prints, per location, how many files were written, removed and left unchanged.
- Both are ordinary `dld` commands: `--help`, strict argument parsing (DL-017) and the error and exit-code conventions of DL-012. They are new commands, not script ports, so DL-011's naming rule does not apply.
- The logic lives in library code (`src/generate/install.ts`, `harnesses.ts` and `rule.ts`): `planInstall` renders and validates everything, and `applyInstall` writes it. The command modules only parse arguments, prompt and print (DL-007).
- Commands may return a promise (`init` awaits the prompt); the dispatcher reports errors from either kind the same way, and `bin.ts` awaits the exit code.

**Rationale:** One command that does what the init skill does mechanically, plus installing skills, gives npm users a working project without an agent session. Refusing to re-run `init` protects existing configuration, and `update` handles everything after setup.

**Code:** `src/cli/commands/init.ts` → `initCommand`, `src/cli/commands/update.ts` → `updateCommand`, `src/generate/install.ts` → `planInstall`, `applyInstall`, `src/cli/index.ts` → `run`, `src/cli/commands.test.ts`, `tests/cli/cli.test.ts`

---

### DL-041: Target harnesses by name, detect them, and confirm the selection

- `--agent` takes harness names, comma-separated and repeatable. Each maps to a skill layout and a rule channel (DL-045):

| Harness | Skills | Rule |
|---|---|---|
| `claude` | `.claude/skills/` (claude-code adapter) | `.claude/rules/dld-workflow.md` |
| `antigravity` | `.agents/skills/` (agent-skills adapter) | `.agents/rules/dld-workflow.md` |
| `codex`, `cursor`, `opencode`, `pi` | `.agents/skills/` (agent-skills adapter) | managed block in the instructions file |

- Harnesses that share a layout or channel install it once.
- `dld init` detects harnesses from markers at the project root:
  - `claude`: `.claude/` or `CLAUDE.md`
  - `antigravity`: `.agents/rules/`, `.agent/` or `GEMINI.md`
  - `codex`: `.codex/`
  - `cursor`: `.cursor/`
  - `opencode`: `.opencode/`, `opencode.json` or `opencode.jsonc`
  - `pi`: `.pi/`
  - `AGENTS.md` or `.agents/skills/` with no more specific marker select the `.agents/skills/` layout and the managed block, as for `codex`.
- Selection in `dld init`:
  - In an interactive terminal (stdin and stdout are TTYs) and without `--yes`, it lists every harness with the detected and `--agent` ones preselected, noting which marker was found. The user toggles entries by number (space- or comma-separated) and confirms with Enter; an empty selection or an unknown number asks again. The prompt uses `node:readline/promises`, adds no dependency, and reaches the command as `Io.prompt`, which `bin.ts` sets only on a TTY, so tests drive it with scripted answers. Ctrl-C or end of input cancels with exit code 130 before anything is written.
  - Otherwise the selection is the detected harnesses plus `--agent`. If that is empty, it fails with a usage error that lists the names.
- `dld update` never prompts: it refreshes what is installed plus any `--agent`.
- An unknown harness name is a usage error that lists the valid names.
- Gemini CLI is not a named target. Its users get skills through the `.agents/skills/` layout, and the docs (workstream 10) explain adding AGENTS.md to its `context.fileName`.

**Rationale:** Harness names are what users know, while the table is the one place that knows each harness's layouts. Detection with confirmation gives a good default without silent guessing, and flags keep CI non-interactive.

**Code:** `src/generate/harnesses.ts` → `HARNESSES`, `detectHarnesses`, `src/cli/install.ts` → `selectHarnesses`, `parseAgents`, `src/bin.ts`, `src/generate/harnesses.test.ts`

---

### DL-042: Ship templates in the npm package; the CLI installs itself into dld-common
*Amends: DL-002*

- The package `files` allowlist adds `templates/skills/` and `templates/rules/`. `npm run check:pack` asserts they are included.
- `dld init` and `dld update` find the templates relative to the running CLI file: `<directory of dld.mjs>/../templates/`, which is `templates/` in the npm package and in a dld-kit checkout. `bin.ts` resolves the file from `import.meta.url` and passes it to commands as `Io.cliPath`; library code receives it as an argument, so core stays free of `process` (DL-007).
- The CLI copies its own file into the output as `dld-common/scripts/dld.mjs` (DL-035's `extraFiles`), so a project's skills carry exactly the CLI version that installed them, and their version stamps match it.
- A CLI copy with no templates beside it (the one inside `dld-common`) fails `init` and `update` with an error naming the npm route, e.g. `npx dld-kit@latest init`.
- The rule text (`templates/rules/dld-workflow.md`) is imported as a string with `import ... with { type: "text" }`, which both esbuild (the bundle) and Bun (tests, `npm run generate`) inline, so every copy of the CLI, including the one inside `dld-common`, can install the rule (DL-045).

**Rationale:** Rendering at install time keeps one generator path and lets output depend on the project. Copying the running CLI file avoids a second bundle and guarantees the installed CLI matches the version stamps.

**Code:** `package.json`, `scripts/check-pack.mjs`, `src/generate/install.ts` → `packageSource`, `src/generate/rule.ts` → `RULE_TEXT`, `src/cli/command.ts` → `Io`, `src/bin.ts`

---

### DL-043: Own the dld-* skill directories on update: overwrite, prune, refuse downgrades
*Amends: DL-033*
*Amended by: DL-051*

- In each skills directory, dld-kit owns the `dld-*` directories (as DL-033). `init` and `update` make them hold exactly the generated output: changed files are overwritten, missing files written, and other files removed. Local edits are overwritten, as the generated-file notice says (DL-044).
- Directories left empty by pruning are removed, bottom-up, up to but not including the skills directory. This applies to `npm run generate` too. `Context.fs` gains an operation that removes an empty directory and fails on a non-empty one.
- Installed Claude Code skills imply Claude Code's rule channel, so `update` (and `install-rule`) install `.claude/rules/dld-workflow.md` for a project that never had it (a pre-1.0 copy) or lost it (a CLAUDE.md created after the block went into AGENTS.md); DL-045 still skips it when Claude Code loads the block. The `.agents/skills/` layout does not name a harness, so when it has skills but no rule channel, `update` warns and names `dld install-rule --agent`.
- Skills and owned rule files are never written through a symlinked directory: if a skills directory, a rules directory or a parent of one under the project root is a symlink (for example `.claude/skills -> ../.agents/skills`), the install fails with a message instead of writing both layouts into one directory.
- Before writing, `init` and `update` read `metadata.dld-kit-version` from each installed `dld-*` SKILL.md and the stamp of each installed rule channel (DL-045). If any is newer than the running CLI (compared as semver, with prerelease identifiers compared one by one, so `rc.10` is newer than `rc.9`), it refuses, naming the file and both versions; `--force` overrides.
- Missing or unparsable stamps (pre-1.0 copies, hand edits) count as older and are replaced. This is the migration path for copy and Tessl users: their `dld-*` directories are rewritten and the old `scripts/*.sh` are removed.
- If CLAUDE.md contains a `## DLD (Decision-Linked Development)` heading outside dld-kit's markers (the old dld-init block), `init` and `update` print a warning that the rule is now installed separately and the block can be removed, or, if no rule is installed, to install it first. They never edit it.
- Writes are atomic (DL-015). Skills outside the `dld-*` directories are never read, changed or removed.

**Rationale:** Treating `dld-*` directories as fully generated keeps updates predictable, the downgrade guard stops an old global `dld` from replacing newer skills, and the old unmarked CLAUDE.md block is only warned about to avoid destroying user text.

**Code:** `src/generate/generate.ts` → `writeOutput`, `src/core/context.ts` → `FileSystem`, `src/generate/install.ts` → `checkDowngrade`, `installedTargets`, `src/generate/rule.ts` → `legacyBlockWarnings`, `refuseSymlinkedDir`, `src/cli/commands/update.ts` → `updateCommand`, `src/generate/install.test.ts`

---

### DL-044: Use one generated-file notice that holds in every install
*Amends: DL-033*

- The generated-file notice in every output reads: `<!-- Generated by dld-kit from templates/skills/<skill>/SKILL.md. Do not edit: updating the skills overwrites this file. -->`
- Rule files that dld-kit owns (DL-045) carry the same kind of notice, naming `templates/rules/dld-workflow.md`.
- Contributors keep learning where to edit from CLAUDE.md and PRACTICES.md, which already say to edit `templates/` and run `npm run generate`.

**Rationale:** A generated file cannot know which channel installed it, so one notice that holds everywhere is simpler than per-channel wording.

**Code:** `src/generate/generate.ts` → `manifest`, `src/generate/rule.ts` → `notice`

---

### DL-045: Deliver the always-on rule through owned rule files and a managed AGENTS.md block
*Amended by: DL-049, DL-054, DL-055, DL-061*

- **Text.**
  - `templates/rules/dld-workflow.md` is the one source for every channel.
  - It names skills rather than slash commands ("look up the decision with the dld-lookup skill"), because invocation syntax differs: Pi uses `/skill:dld-lookup`.
  - It keeps annotation examples in code spans, because Claude Code and Antigravity treat a bare `@path` as a file reference.
- **Owned rule files.** dld-kit owns these files outright and rewrites them on every update. Each carries the DL-044 notice with its version.
  - Claude Code: `.claude/rules/dld-workflow.md`.
  - Antigravity: `.agents/rules/dld-workflow.md`, with frontmatter `trigger: always_on`.
- **Managed block.**
  - For Codex, Cursor, OpenCode and Pi, a block between `<!-- dld-kit:start -->` and `<!-- dld-kit:end -->` holds the text and a version stamp.
  - It goes in the instructions file those harnesses read: AGENTS.md if it exists, else CLAUDE.md if it exists, else a new AGENTS.md. Creating AGENTS.md next to CLAUDE.md would make Pi and OpenCode stop reading CLAUDE.md.
  - When the block is in CLAUDE.md, AGENTS.md does not resolve to it, and Codex is among the named harnesses, dld-kit warns that Codex reads only AGENTS.md and says how to move the block.
- **An existing block stays where it is.** If AGENTS.md or CLAUDE.md already holds a block, it is refreshed in place rather than moved, even if the placement rule would now pick the other file.
- **Only regular files are edited.** An AGENTS.md that is a symlink is neither written through nor replaced; if it would receive a new block and there is no regular CLAUDE.md, the command fails and asks the user to point it at a regular file or add the block by hand.
- **Once per harness.** A harness that already loads the file holding the block gets no owned rule file, and a stale one is removed (with its directory, if that is left empty). Which file a harness loads is resolved through symlinks, so a `CLAUDE.md` linked to `AGENTS.md` (or the reverse) counts as holding the block:
  - Claude Code, when the block is in CLAUDE.md, or in AGENTS.md with no CLAUDE.md.
  - Antigravity, when the block is in AGENTS.md.
- **Editing the block.**
  - The block is replaced in place, and the rest of the file stays byte-identical, including its line endings.
  - When there is no block yet, it is appended after a blank line.
  - A start marker without an end, an end before a start, or more than one block is an error naming the file, and nothing is written.
- **Command.**
  - `dld install-rule --agent <names>` does only the rule step, and also refreshes any rule channel already installed; without `--agent` it only refreshes, and fails if nothing is installed. `init` and `update` call the same library code.
  - Because the rule text is embedded in the bundle (DL-042), the command works from any copy of the CLI, including the one inside `dld-common`.
- **Plugins and extensions.** A Claude plugin `SessionStart` hook, a Pi extension, an OpenCode plugin, or an Antigravity plugin's `rules/` deliver the same text. They are built with the plugin work in workstream 9.

**Rationale:** Owned files avoid editing files the user writes, a marker block is the only way to reach Codex and the least surprising for Pi and OpenCode, and loading the rule once per harness avoids wasted context and conflicting copies.

**Code:** `templates/rules/dld-workflow.md`, `src/generate/rule.ts` → `planRule`, `upsertBlock`, `src/cli/commands/install-rule.ts` → `installRuleCommand`, `src/generate/rule.test.ts`

---

### DL-046: Keep generated skills usable in harnesses that read another harness's directory
*Amends: DL-031, DL-036*

- The claude-code adapter's `{{dld-setup}}` text starts by defining the variable: "`${CLAUDE_SKILL_DIR}` is the absolute path of this skill's directory."
  - Claude Code substitutes it, so the sentence reads as a true statement about the path.
  - A harness that does not substitute it can resolve the variable from the base directory it reports.
- The generator rejects template text that another harness's skill loader rewrites: `$ARGUMENTS`, `$` followed by a digit, and `` !` ``. The error names the template and line. The check covers code blocks too, since loaders do not distinguish them.

**Rationale:** One sentence makes the Claude copy usable wherever another harness reads it, and failing at generation catches templating hazards before a skill silently loses text.

**Code:** `src/generate/adapters.ts` → `claudeCodeAdapter`, `src/generate/template.ts` → `parseTemplate`, `src/generate/template.test.ts`

---

### DL-047: Install the rule through the CLI from the dld-init skill and in this repository

- **dld-init skill.**
  - The skill keeps its interactive steps: flat or namespaced, the namespaces, and the optional PRACTICES.md.
  - The hand-written CLAUDE.md step is replaced by `{{dld}} install-rule --agent <harness>` (DL-045). The agent names the harness it is running in, and asks the user when unsure or when the team uses several.
  - The skill no longer contains the rule text.
  - Its prerequisites and next steps mention `npx dld-kit init` as the npm route, which also installs the skills.
- **This repository.**
  - `npm run generate` also writes `.claude/rules/dld-workflow.md` from the template, using the same renderer as `dld install-rule`, and `npm run check:generated` covers it. The npm `version` script stages `.claude/rules` with the regenerated skills.
  - The DLD section of CLAUDE.md is removed. CLAUDE.md keeps the note that `decisions/` is dld-kit's own log.

**Rationale:** One source for the rule text, rendered by one piece of code, ends drift between copies; the agent knows its harness where the CLI cannot, and dogfooding exercises the Claude Code channel in every session here.

**Code:** `templates/skills/dld-init/SKILL.md`, `scripts/generate.ts`, `.claude/rules/dld-workflow.md`, `CLAUDE.md`

---

## Distribution channels (v1-distribution)

### DL-048: Ship a Claude Code plugin generated into claude-plugin/, with a marketplace in the same repository

- **The marketplace.**
  - `.claude-plugin/marketplace.json` at the repository root declares the marketplace `dld-kit`, with owner, description and one plugin entry.
  - The entry is named `dld`, with `source: "./claude-plugin"`, a description, category and tags.
  - Users install with `/plugin marketplace add jimutt/dld-kit` and `/plugin install dld@dld-kit`. Skills run as `/dld-plan`, or `/dld:dld-plan` when another skill has the same name.
- **`claude-plugin/` is generated output**, committed and drift-checked like `skills/` (DL-033). It holds:
  - `.claude-plugin/plugin.json`: name `dld`, version, description, author, homepage, repository, license, keywords. There is no `skills` field; the default `skills/` discovery applies.
  - `skills/`, rendered by the claude-code adapter, including `dld-common/scripts/dld.mjs` (DL-035). dld-common has no SKILL.md in that adapter, so it appears neither in the menu nor in the model's context.
  - `hooks/hooks.json`, the rule hook (DL-049).
- **Generation.**
  - `scripts/generate.ts` writes `claude-plugin/` and `.claude-plugin/marketplace.json`, and `npm run check:generated` fails when either differs.
  - Manifest fields (description, author, homepage, repository, license, keywords, version) are rendered from `package.json`, so they cannot disagree (DL-052).
- **Exclusions.**
  - `claude-plugin/**` is added to this repository's `annotation_exclude` (DL-023), like `skills/**`, and to any lint exclusion `skills/` has.
  - It is not part of the npm package.
- **Real copies, not symlinks.** Every generated `dld.mjs` stays a full copy.
  - `gh skill install` skips symlinks, and `npm pack` leaves them out of the tarball, so `skills/` must hold the real file.
  - Claude Code copies a symlink's target into the cache only for marketplace installs from a repository. It skips such links for plugins installed from a local path, which is the usual way to test the plugin.
  - Windows checkouts without symlink support, and a plain `cp -r` of `.claude/skills/dld-*`, would break the dogfooding copy.
- **Collapsed diffs.** A `.gitattributes` file marks the generated paths `linguist-generated`, so GitHub collapses them in pull request diffs: `skills/`, `.claude/skills/`, `.claude/rules/`, `claude-plugin/` and the generated manifests.
- **PR #23** is closed as replaced by this decision.
- **Refinements during implementation.**
  - `package.json` gains an `author` field, which the manifests use for author and owner.
  - The generated root `plugin.json` is excluded from Biome, whose JSON formatting differs from the generator's.
  - Both manifests pass `claude plugin validate`. A headless session with the plugin listed the twelve user-facing skills without dld-common.
  - `check:generated` also reports files in `claude-plugin/` that nothing renders, and `generate` removes them.
  - `.gitattributes` anchors each pattern at the repository root (`/plugin.json`), so a hand-written `plugin.json` elsewhere is not marked generated.
  - The claude-code adapter renders once and the result is written to both `.claude/skills/` and `claude-plugin/skills/`. The unused `ADAPTERS` list is removed; DL-032's reference moves to `OUTPUTS` in `scripts/generate.ts`.

**Rationale:** Rendering the plugin with the claude-code adapter gives Claude Code the same skill text from any channel, a subdirectory keeps the plugin cache small, and generating manifests from `package.json` removes a second version source.

**Code:** `scripts/generate.ts`, `src/generate/plugins.ts` → `renderPluginFiles`, `CLAUDE_PLUGIN_DIR`, `claude-plugin/`, `.claude-plugin/marketplace.json`, `.gitattributes`, `dld.config.yaml`, `biome.jsonc`, `src/generate/plugins.test.ts`

---

### DL-049: Print the rule from a plugin SessionStart hook through dld session-context
*Amends: DL-045*
*Amended by: DL-054*

- **The command.** `dld session-context --agent <name>` prints the rule text (`templates/rules/dld-workflow.md`, without the generated-file notice) to stdout only when both hold:
  - The current directory is inside a project whose root (DL-010) has `dld.config.yaml`.
  - The named agent does not already load the rule there. This is judged with the same resolution `install-rule` uses (DL-045): the agent's owned rule file exists, or the file it loads (resolved through symlinks) holds the managed block or the legacy DLD heading.

  Otherwise it prints nothing. It never writes.
- **Agents.** `--agent` takes the harness names of DL-041. Only `claude` is wired to a hook in 1.0; a Pi extension or OpenCode plugin can call the same command later.
- **It never breaks a session.**
  - Outside a git repository, without a config, or with an unreadable file, it prints nothing and exits 0.
  - Any other error writes one line to stderr and exits 0.
  - Usage errors (a missing or unknown `--agent`) still exit 2, since they mean the hook itself is misconfigured.
- **The hook.** `claude-plugin/hooks/hooks.json` declares one `SessionStart` hook with no matcher, so it also fires after `/clear` and compaction. Its command is `node "${CLAUDE_PLUGIN_ROOT}/skills/dld-common/scripts/dld.mjs" session-context --agent claude`.
- **The dld-init skill still installs the committed rule for Claude Code.** Teammates without the plugin then get it too, and the hook falls silent in that project.
- **Refinements during implementation.**
  - Each harness in the table (DL-041) lists the instruction files it reads, in order (`instructions`). Claude Code reads CLAUDE.md, else AGENTS.md; Pi and OpenCode read AGENTS.md, else CLAUDE.md; the others read AGENTS.md. `loadsRule` checks the first that exists.
  - A start marker or the legacy heading anywhere in that file counts as loaded, so malformed markers do not make the hook print a second copy.
  - The config is only checked for existence, not parsed.
  - The hook's matcher is `startup|clear|compact`. A resumed session still has the earlier hook output, so `resume` would add the rule a second time.
  - The hook command starts with `command -v node >/dev/null 2>&1 || exit 0`, so a machine without `node` on PATH gets no hook error in every session.
  - `planRule` (DL-045) now reads the same `instructions` lists instead of its own Claude Code rule. Its warning covers every named block reader that does not read the file holding the block: Codex and Cursor when the block is in CLAUDE.md, and Pi and OpenCode when it was left in CLAUDE.md after an AGENTS.md appeared. Callers pass the named harnesses instead of a Codex flag.

**Rationale:** Checking what the agent already loads keeps the rule to one copy for plugin users in `dld init` projects, and a hook that runs in every project must fail silently. CLI logic keeps it testable.

**Code:** `src/cli/commands/session-context.ts` → `sessionContextCommand`, `src/generate/rule.ts` → `sessionContext`, `loadsRule`, `src/generate/harnesses.ts` → `Harness`, `src/generate/plugins.ts` → `SESSION_START_COMMAND`, `claude-plugin/hooks/hooks.json`, `src/generate/rule.test.ts`, `src/cli/commands.test.ts`, `tests/cli/cli.test.ts`

---

### DL-050: Publish portable plugin manifests for Codex and Copilot CLI, and a Pi package entry

- **A root `plugin.json`** following the Agent Plugins schema: `$schema`, name `dld`, version, description, author, homepage, repository, license, keywords. It lists no components, so the conventional root `skills/`, the portable variant, is the plugin's skill set.
- **Two marketplaces** name that plugin, each declaring marketplace `dld-kit` with plugin `dld` whose source is the repository root (`./`):
  - `.agents/plugins/marketplace.json`, for Codex
  - `.github/plugin/marketplace.json`, for Copilot CLI
- **Generation.** `scripts/generate.ts` writes all three files from `package.json` fields, and `npm run check:generated` verifies them (DL-052).
- **No hooks in these plugins.**
  - Codex requires users to trust plugin hooks by hand.
  - The rule reaches both harnesses through the dld-init skill's `install-rule` (the AGENTS.md block, DL-045).
- **Pi.** `package.json` gains `"pi": { "skills": ["./skills"] }` and the keyword `pi-package`, so `pi install npm:dld-kit` (or `-l` for a project) installs the portable skills.
- **Not shipped in 1.0: Cursor and Antigravity manifests.** Their users install with `dld init` or `npx skills`.
- **Refinements during implementation.**
  - The root `plugin.json` declares Agent Plugins schema 1.0.0, the version Codex documents.
  - Codex's marketplace entry uses `"source": {"source": "url", "url": "https://github.com/jimutt/dld-kit.git"}`, which Codex documents for a plugin at the repository root, and carries the `policy` and `category` fields Codex requires. Copilot CLI's entry uses the relative source `./`.
  - The manifests drop the `cli` and `pi-package` keywords, which describe the npm package.

**Rationale:** One Agent Plugins manifest over the portable `skills/` reaches both harnesses without another generated copy, and separate marketplace files keep them from installing the Claude Code variant.

**Code:** `src/generate/plugins.ts` → `renderPluginFiles`, `plugin.json`, `.agents/plugins/marketplace.json`, `.github/plugin/marketplace.json`, `package.json`, `biome.jsonc`, `src/generate/plugins.test.ts`

---

### DL-051: Coexist with npx skills and gh skill installs, and check the installers in CI
*Amends: DL-043*

- **dld-common stays installable by default.** The portable dld-common SKILL.md never carries `metadata.internal`, and a generator test asserts it.
- **Partial installs.** A partial install without dld-common is handled by the `{{dld-setup}}` check (DL-036), which names `npx skills add jimutt/dld-kit --skill dld-common`.
- **`dld init` and `dld update` never write through a symlinked skill directory.** If a `dld-*` entry in a target skills directory is a symlink, they fail before writing anything. The error names the entry, says another installer such as `npx skills` manages it, and says to update with `npx skills update` or remove those skills first. `--force` does not override this. It amends DL-043's symlink rule to cover each skill directory.
- **A warning when `npx skills` manages the skills.** When `skills-lock.json` at the project root lists a `dld-*` skill, `init` and `update` warn that `npx skills` manages those skills, and that `dld update` and `npx skills update` will overwrite each other's copies.
- **A CI job checks the installers.** It runs a script under `scripts/` that uses a pinned `npx skills@1.7.0` with the checked-out repository as a local source, in temporary projects:
  - **Full install.** `add <repo> --all -y`, with a `.claude/` directory present, installs every `dld-*` skill exactly once.
    - The installed text is the portable variant: no `${CLAUDE_SKILL_DIR}`, and nothing from `claude-plugin/` or `.claude/skills/`.
    - `.claude/skills/dld-*` are symlinks.
    - `node <skill>/../dld-common/scripts/dld.mjs --version` prints the package version through both the `.agents/skills` path and the `.claude/skills` path.
  - **Partial install.** `add <repo> --skill dld-plan -y` installs dld-plan without dld-common.
  - **Update after npx skills.** `dld update --agent claude`, run with the built CLI in the project from the full install, fails with the symlink error.
- **`gh skill` is checked by hand at release**, since it needs an authenticated `gh` and a release tag.
- **Refinements during implementation.**
  - `installedLayouts` counts a symlinked `dld-*` entry as an installed skill, so `dld update` without `--agent` in a project set up by `npx skills` also refuses, instead of updating only `.agents/skills`.
  - The symlink checks run before the downgrade check.
  - The installer check compares each installed SKILL.md with the committed `skills/` copy, and resolves `<skill>/../dld-common` through the operating system, not `path.join`, so the `.claude/skills` symlink is followed as an agent would.
  - The full install runs `add <repo> --skill '*' --agent claude-code codex --yes` rather than `--all`, which targets every agent `npx skills` knows.
  - The partial-install project also runs `dld update --agent codex` and expects the `skills-lock.json` warning, so a change to the lock file format fails CI.
  - The symlink error also says how to set up DLD without touching those skills: the dld-init skill or `dld install-rule`.
  - The installer CI job checks out without persisting git credentials, since it runs third-party npm code.

**Rationale:** `npx skills` is the most used installer and its defaults conflict with the shared dld-common directly; refusing beats guessing who owns a symlinked skill, and the CI check turns an installer change into a failed build.

**Code:** `src/generate/install.ts` → `refuseSymlinkedSkills`, `skillsLockWarning`, `planInstall`, `scripts/check-installers.mjs`, `.github/workflows/test.yml`, `src/generate/install.test.ts`, `src/generate/generate.test.ts`

---

### DL-052: Release from a version tag with npm trusted publishing; package.json holds the one version
*Amended by: DL-058*

- **One version.** The `version` field in `package.json` is the only version.
  - The generator renders it into the skill stamps, rule notices, plugin manifests and marketplace entries.
  - The `version` npm script runs `npm run generate` and stages every generated path, so `npm version <x>` produces one commit and a `v<x>` tag with everything in step.
- **Releasing.** Run `npm version` on the release branch and push the commit and the tag.
- **The release workflow.** `.github/workflows/release.yml` runs on pushed tags matching `v*`, on a GitHub-hosted runner, in two jobs:
  - **Publish** (`contents: read`, `id-token: write`):
    - Check out and install from the lockfile, on Node 24 with the pinned Bun.
    - Run lint, typecheck, `check:generated`, unit tests, CLI tests and `check:pack`.
    - Fail unless the tag equals `v` plus the `package.json` version.
    - Run `npm publish` with no token. A version with a prerelease part (a `-`) publishes with `--tag next`, others to `latest`.
  - **Release** (`contents: write`), after publish: create a GitHub release for the tag with generated notes, marked as a prerelease when the version is one.
- **Nothing publishes** from branches or pull requests.
- **One-time setup, documented in `docs/releasing.md`:**
  1. Publish the first version by hand with a token.
  2. Configure the trusted publisher on npmjs.com (repository `jimutt/dld-kit`, workflow `release.yml`).
  3. Set the package to require two-factor authentication and disallow tokens.
- **Refinements during implementation.**
  - The publish job installs `npm@11` on Node 24, so trusted publishing does not depend on the npm version Node bundles.
  - `npm version` was rehearsed in a scratch clone: one commit and tag holding every regenerated file.
  - The workflow has three jobs. `verify` (read-only) checks the tag, runs every check and packs the tarball. `publish` runs in the `npm` GitHub environment with `id-token: write`, and publishes that tarball without installing or running project code. `release` creates the GitHub release.
  - The trusted publisher on npm names the `npm` environment, whose deployment rule allows only `v*` tags. That stops a branch or an edited workflow from publishing.
  - Actions in the release workflow are pinned to commit SHAs.

**Rationale:** One version source makes mismatched stamps impossible, trusted publishing removes the long-lived npm token and adds provenance, and the tag check stops a mistyped tag from publishing the wrong version.

**Code:** `.github/workflows/release.yml`, `docs/releasing.md`, `package.json`, `scripts/generate.ts`, `src/generate/plugins.ts` → `renderPluginFiles`

---

### DL-053: Rewrite the README around the 1.0 install channels
*Amended by: DL-063*

The README is rewritten in the implementation of this workstream.

- **Install.**
  - Start with the requirements: Node.js 20+ and git, plus `gh` for the open-PR check in dld-reindex.
  - Channels can be combined. A short "Combining channels" note lists the combinations that cause trouble and what to do about each:
    - A user-level plugin or package (the Claude Code plugin, `pi install`, the Codex or Copilot plugin) in a project that also has dld-kit skills committed for the same agent. The agent sees each skill twice, possibly at different versions; in Claude Code, invoke them as `/dld:dld-plan`.
    - Skills for Claude Code and for an `.agents/skills/` agent in one project. OpenCode and Cursor read both directories. OpenCode 2.x loads one copy of each skill (`.agents/skills/` wins over `.claude/skills/`), while OpenCode 1.x and Cursor may load either. Either copy works (DL-046).
    - `dld update` and `npx skills` managing the same skills. `dld` refuses or warns (DL-051), so pick one of them to update with.
  - Give one subsection per channel, each saying what it installs, how the always-on rule arrives, and how to update:
    - `npx dld-kit init`, recommended for any agent. It sets up the config, the decisions directory, the skills for the detected or chosen agents, and the rule, all committed so teammates need nothing installed. Its flags are `--agent`, `--namespaces` and `--yes`. Update with `npx dld-kit@latest update`.
    - The Claude Code plugin: `/plugin marketplace add jimutt/dld-kit` and `/plugin install dld@dld-kit`, then `/dld-init` per project. The hook supplies the rule, and updates come through `/plugin update` or auto-update. The same marketplace serves Copilot CLI (`copilot plugin marketplace add jimutt/dld-kit`).
    - The Codex plugin: `codex plugin marketplace add jimutt/dld-kit`.
    - Pi: `pi install npm:dld-kit`.
    - `npx skills add jimutt/dld-kit` or `gh skill install jimutt/dld-kit`, then `/dld-init` for the config and rule. With `--skill`, dld-common must be included too. Update with `npx skills update` or `gh skill update`.
    - Manual copy from `skills/` (portable) or `.claude/skills/` (Claude Code).
- **Supported agents.** A table of Claude Code, Antigravity, Codex, Cursor, OpenCode, Pi and Copilot CLI, listing the skills directory `dld init` uses, where the rule goes, and how to invoke a skill.
  - Invocation syntax is shown only where the harness documents it (`/dld-plan` in Claude Code, `/skill:dld-plan` in Pi). Otherwise the README says to ask the agent to use the skill by name.
- **CLI.** A short section on `dld init`, `dld update`, `dld install-rule` and `dld --help`. The remaining commands are used by the skills.
- **Kept sections.** The workflow, concept, skills, configuration and acknowledgement sections stay. The skills table stays in slash form for Claude Code, with a line on other harnesses.
- **Project structure.** The trees show `decisions/records/` and namespaced `decisions/records/<namespace>/`.
- **Manual rule setup** stays as it is.
- **Language.** Plain, direct wording with high information density and little abstraction. Say what a command does, which files it writes, and what the user runs next. Prefer concrete paths, commands and examples over general descriptions. Leave out marketing tone and filler.
- **Also updated:**
  - docs/plan/v1.md's distribution table, to what ships in 1.0: Cursor and Antigravity plugins deferred, Pi added.
  - CLAUDE.md's directory structure, for the new generated paths.
- **Not in this rewrite.** The "Early development" note and upgrade notes for pre-1.0 users stay for workstream 10.
- **Refinements during implementation.**
  - The dld-init skill tells the agent to use `codex` for a harness that reads AGENTS.md and has no name of its own, such as Copilot CLI.

**Rationale:** Users pick an install channel first, and the right one depends on their agent, so the README leads with that choice; invocation is documented only where verified.

**Code:** `README.md`, `docs/plan/v1.md`, `CLAUDE.md`, `templates/skills/dld-init/SKILL.md`, `docs/install.md`

---

## Rule placement (rule)

### DL-054: Resolve the instruction file each agent reads from Claude Code's documented rules and the planned block
*Amends: DL-045, DL-049*
*Amended by: DL-055, DL-061*

- **Claude Code's instruction list follows its documentation:** `[CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md, AGENTS.md]`. A harness reads the first entry that exists. Claude Code therefore reads the block in AGENTS.md only when none of the three CLAUDE files exists. Otherwise it gets `.claude/rules/dld-workflow.md`, and the plugin hook (DL-049) counts it the same way.
- **Planned files count as existing.** When `planRule` resolves the file a harness reads, a file that will receive the block counts as existing. When no listed file exists, the harness reads nothing, and there is no fallback to the last entry.
- **The warning names the real file.** It says which file each harness reads: "The dld-kit rule block is in CLAUDE.md, but Codex reads AGENTS.md …". A harness that reads no instruction file at all is reported as reading its first entry, which is where the block would have to go.
- **A note when Claude Code relies on AGENTS.md.** When Claude Code is among the harnesses, reads the block from AGENTS.md, and the plan writes the block, init and install-rule print a note. It says that adding a CLAUDE.md, `.claude/CLAUDE.md` or `CLAUDE.local.md` later stops Claude Code from reading AGENTS.md, and that `dld update` or `dld install-rule` then installs `.claude/rules/dld-workflow.md`. The note goes out with the warnings.
- **The README says where Claude Code's rule goes:** `.claude/rules/dld-workflow.md`, unless Claude Code already reads the block in AGENTS.md.
- **Once per harness stays:** the rule is never written twice for Claude Code.
- **Parent directories are not checked.** Claude Code also counts CLAUDE files above the working directory. dld-kit installs per project, so it only looks at the project root.

**Rationale:** Following Claude Code's documented rule avoids both duplicate and lost rules, resolving against the planned block removes an ordering accident, and the note surfaces the remaining fragile case at setup time.

**Code:** `src/generate/harnesses.ts` → `HARNESSES`, `src/generate/rule.ts` → `planRule`, `instructionFile`, `blindWarnings`, `src/generate/rule.test.ts`, `src/cli/commands.test.ts`, `README.md`, `docs/install.md`

---

## 1.0 release (v1-release)

### DL-055: Give Claude Code the AGENTS.md block through a dld-kit .claude/CLAUDE.md import, and follow AGENTS.md imports
*Amends: DL-045, DL-054*

- **What Claude Code reads.** dld-kit models it as follows:
  - Every CLAUDE file that exists at the project root (`CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`).
  - Plus AGENTS.md when one of them has a line that imports it (`@AGENTS.md`, or `@../AGENTS.md` from `.claude/CLAUDE.md`, outside code spans and fences).
  - When none of the three exists, Claude Code reads AGENTS.md directly.

  Claude Code loads the rule when any file it reads holds the block. `planRule` and `loadsRule` (so also `session-context`) use this model instead of the first-existing-file rule for Claude Code.
- **The import file.**
  - When the plan leaves Claude Code reading the block only by reading AGENTS.md directly, dld-kit creates `.claude/CLAUDE.md` instead of relying on that. This holds when the `claude-file` channel is installed, the block is in AGENTS.md, and neither `CLAUDE.md` nor `.claude/CLAUDE.md` exists. A `CLAUDE.local.md` does not count: it is personal and usually not committed, and the import is right with or without it.
  - The file holds the generated-file notice (DL-044) and one line, `@../AGENTS.md`.
  - Claude Code then reads AGENTS.md through the import. The rule loads once, and it keeps loading when a `CLAUDE.md` or `CLAUDE.local.md` appears later.
- **Ownership.**
  - dld-kit creates `.claude/CLAUDE.md` only when it does not exist, and rewrites it only when it carries dld-kit's notice.
  - It never removes it: a leftover import is harmless, per the documentation.
  - A `.claude/CLAUDE.md` without the notice belongs to the user and is only read.
- **Output.** `init`, `update` and `install-rule` report "Wrote .claude/CLAUDE.md (imports AGENTS.md for Claude Code)". DL-054's note is removed.
- **Existing projects.** `dld update` creates the file in projects set up by rc.1 and rc.2 that rely on AGENTS.md.
- **Refinements during implementation.**
  - An import is an `@path` token at the start of a line or after whitespace, whose path resolves from the importing file to the root AGENTS.md (`@AGENTS.md` and `@./AGENTS.md` from the root, `@../AGENTS.md` from `.claude/`). Imports in code spans and in fenced blocks do not count; a fence closes only on the same character, at least as long.
  - Instruction files are read through symlinks, as the harnesses read them, so a `CLAUDE.md` linked to AGENTS.md counts as holding its block. Ownership and writes still use regular files only.
  - When `.claude` is a symlink, dld-kit writes no import file and warns instead. An import file behind such a link is left alone, so `install-rule` does not fail.
  - The import file's notice reads `Generated by dld-kit <version> for Claude Code: ...`, which marks it as dld-kit's. While it exists, it counts as Claude Code's installed rule, so `update` refreshes it, and its version takes part in the downgrade check.
  - The model applies to Claude Code only. The other harnesses still read the first file of their list that exists.
  - A `CLAUDE.md` that is not a regular file, such as a directory, now reads as empty instead of failing `session-context`; its error test uses a failing file read instead.
  - Checked with Claude Code 2.1.283 in headless mode, using a marker sentence in AGENTS.md. With `.claude/CLAUDE.md` alone, with a `CLAUDE.md` and `CLAUDE.local.md` added, and with a root `CLAUDE.md` holding `@AGENTS.md`, Claude Code had the sentence in context and reported it once. The count is the model's own report.

**Rationale:** The import is Claude Code's own recommended bridge and keeps the rule to one copy. Placing it in `.claude/CLAUDE.md` keeps dld-kit out of the root files users edit and out of other harnesses' CLAUDE.md fallback.

**Code:** `src/generate/rule.ts` → `planRule`, `instructionFiles`, `importsAgentsMd`, `renderImportFile`, `loadsRule`, `src/generate/harnesses.ts`, `src/cli/install.ts` → `printReport`, `src/generate/rule.test.ts`, `src/cli/commands.test.ts`, `README.md`, `docs/install.md`

---

### DL-056: The semver contract covers the setup commands; the commands the skills run are internal
*Amends: DL-002, DL-011*

- **Public.** The semver contract for the `dld` CLI covers the setup commands:
  - `init`, `update`, `install-rule` and `session-context`, with their flags, exit codes and documented output;
  - `--help` and `--version`.
- **Internal.** All other commands are the commands the skills run. Their names, arguments and output may change in any minor release, together with the skill templates that call them.
- **Help output.** `dld --help` lists the two groups under separate headings, "Setup commands" and "Commands the skills run (internal; may change in minor releases)". Each internal command's `--help` says the same in one line.
- **Documentation.** The README's CLI section and `docs/releasing.md` state the contract. The library API stays internal, as DL-002 says.
- **Renaming.** Regrouping the internal commands (e.g. `dld decision create`) remains possible later, without a major version. It needs its own decision.
- **Refinements during implementation.**
  - Each command the skills run sets `internal: true` in its module. The setup group lists the commands without it.
  - An internal command's `--help` appends: "Internal: the dld-kit skills run this command. Its name, arguments and output may change in a minor release."

**Rationale:** The bundled CLI makes the skill commands an implementation detail, so treating them as public would freeze bash-era names for no benefit; `--help` states the boundary.

**Code:** `src/cli/command.ts` → `Command`, `src/cli/index.ts` → `usage`, `INTERNAL_NOTE`, `src/cli/commands/`, `src/cli/index.test.ts`, `README.md`, `docs/releasing.md`

---

### DL-057: Migrate pre-1.0 installs with dld update and document it in the README
*Amended by: DL-063*

- **The README gets an "Upgrading from 0.x" section.** It covers:
  - **Your data:** the config, records, `INDEX.md` and `.dld-state.yaml` carry over unchanged.
  - **Copied skills in `.claude/skills/` or `.agents/skills/`:** run `npx dld-kit@latest update --agent <names>` in the project. It rewrites the `dld-*` skills, removes the old `scripts/*.sh`, and installs the always-on rule. Commit the result.
  - **Copied skills anywhere else** (such as `.cursor/skills/` or `.codex/skills/`): delete those `dld-*` directories, then run the same `update`.
  - **Tessl installs:** remove the `dld-kit/dld` tile with Tessl, and delete any DLD rule text Tessl added. Then run `update`. The Tessl tile gets no further versions.
  - **The old CLAUDE.md section:** after the rule is installed, delete the `## DLD (Decision-Linked Development)` section. `update` prints a warning while it is present, and never edits it.
  - **Other channels:** users who prefer the plugin or `npx skills` delete the copied `dld-*` directories and the old CLAUDE.md section first, then install through that channel.
- **Verified before release.** The implementation builds a project with the skills and `/dld-init` output from `main` (pre-1.0): copied `.claude/skills`, a config, records and the CLAUDE.md section. It then runs the built `dld update --agent claude,codex` against it, and confirms that the old CLAUDE.md section is only warned about, the scripts are gone, and the 1.0 skills read the existing records, index and state. It records the result in the PR. A CLI integration test covers the same scenario with a fixture.
- **Refinements during implementation.**
  - Verified with a project built by `main`'s 0.x bash scripts. The project had copied `.claude/skills`, a config, two records (one amending the other), an annotation, `INDEX.md`, an audit and snapshot state, and the `CLAUDE.md` section. `dld update --agent claude,codex` from the built CLI rewrote the 13 skills and removed their 22 scripts. The `CLAUDE.md` section was only warned about. The 1.0 CLI gave `DL-003` for `next-id`, regenerated an identical `INDEX.md`, found the annotation, and matched the old `detect-snapshot-changes.sh` output (full, then incremental once the snapshot files exist).
  - The same run found that every 0.x project has a `CLAUDE.md` (the old dld-init appended to it) and usually no `AGENTS.md`. The rule block therefore goes into `CLAUDE.md` (DL-045), which Codex and Cursor do not read, and `update` warns. The README tells Codex and Cursor users to create an empty `AGENTS.md` before running `update`. With it, the block goes to `AGENTS.md`, Claude Code gets `.claude/rules/dld-workflow.md`, and the only warning is about the old section. Changing where a new block goes is left to a separate decision.
  - Until the old section is deleted, Claude Code reads the rule twice. The README says so.

**Rationale:** `dld update` already performs the migration, so users mainly need to know to run it and what it leaves to them; a real pre-1.0 project check catches what fixtures miss.

**Code:** `README.md`, `tests/cli/cli.test.ts`, `docs/upgrading-from-0x.md`

---

### DL-058: Ship workstream 10 as 1.0.0-rc.3 from v1; release 1.0.0 from main only after the release candidates run clean
*Amends: DL-052*
*Amended by: DL-062*

- **This workstream ends with `1.0.0-rc.3`,** tagged on `v1` with `npm version 1.0.0-rc.3` after its PRs merge. It publishes to the `next` dist-tag (DL-052).
- **The release candidates continue from `v1`,** as rc.4 and so on, until the project owner judges them clean in real repositories. There is no fixed number of candidates and no date.
- **The steps for 1.0.0, when that time comes:**
  1. Merge `v1` into `main` (PR #76), so the marketplaces serve the 1.0 plugin.
  2. Run `npm version 1.0.0` on `main` and push the tag.
  3. Remove the README's "Early development" note in that release.
  4. Retire `v1`: stop CI triggering on it, and state in `docs/releasing.md` that `main` is the release branch.
  5. Mark docs/plan/v1.md as done.

  None of these happen in this workstream.
- **Docs now.** `docs/releasing.md` says that release candidates come from `v1` until 1.0.0, and lists the 1.0.0 steps above.
- **Refinements during implementation.**
  - `docs/releasing.md` also says how to test a candidate's plugin: `claude plugin marketplace add jimutt/dld-kit#v1`.

**Rationale:** Each release candidate had surfaced bugs tests missed, so more real-world runs before committing to the 1.0 contract cost little.

**Code:** `docs/releasing.md`, `.github/workflows/test.yml`

---

### DL-059: Move the pinned GitHub Actions to their Node 24 majors, still pinned by commit SHA
*Amends: DL-005*

- Every action in `.github/workflows/test.yml` and `release.yml` moves to its current major version that runs on Node 24:
  - `actions/checkout`
  - `actions/setup-node`
  - `actions/upload-artifact`
  - `actions/download-artifact`
  - `actions/github-script`
  - `oven-sh/setup-bun`, if its current release targets Node 24
- Each action is pinned by full commit SHA, with the version in a trailing comment. `test.yml` moves from tag pins to SHA pins as well.
- The implementation checks each new major's breaking changes against how the workflows use it, for example the artifact v4→v5 download path behaviour. It confirms a green CI run and a dry run of the release jobs' shape (actionlint) before merging.
- **Refinements during implementation.**
  - Versions: `actions/checkout` v7.0.1, `actions/setup-node` v7.0.0, `actions/upload-artifact` v7.0.1, `actions/download-artifact` v8.0.1, `actions/github-script` v9.0.0 and `oven-sh/setup-bun` v2.2.0. setup-bun v2.2.0 already ran on Node 24, and `release.yml` already pinned it. All six declare `using: node24`.
  - Breaking changes checked against these workflows:
    - checkout v6 moves the persisted credentials into a file under `$RUNNER_TEMP`, and v7 refuses fork code under `pull_request_target`, which these workflows do not use.
    - setup-node v6 caches only when `package.json` names npm as its `packageManager`, and this package names none. Both setup-node steps in `release.yml` still set `package-manager-cache: false`, as setup-node advises for privileged workflows.
    - download-artifact v5 changed where downloads by ID land, but the release downloads by name. v8 fails on a digest mismatch.
    - github-script v9 breaks `require('@actions/github')`. The coverage comment uses only `require("node:fs")`, `github` and `context`.
  - actionlint 1.7.7 reports no problems.

**Rationale:** Staying on deprecated Node 20 action runtimes risks breakage when GitHub removes the shim, and SHA pins keep a moved tag from changing what CI runs.

**Code:** `.github/workflows/test.yml`, `.github/workflows/release.yml`

---

### DL-060: Skip the agent configuration directories that hold installed skills when scanning for annotations
*Amends: DL-019*

- The built-in exclusion list adds the configuration directories of the agents dld-kit installs for, or that the skill installers write to:
  - `.agents` (the shared skills and rules directory, used by Codex, Cursor, OpenCode, Antigravity and Pi)
  - `.agent` (older Antigravity)
  - `.codex`
  - `.cursor`
  - `.opencode`
  - `.pi`
- As with `.claude`, a directory with one of these names is skipped wherever it appears in a path. `annotation_exclude` stays available for anything else.
- A test covers annotation examples in installed skills under each of these directories, and checks that `find-annotations` and `verify-annotations` ignore them.

**Rationale:** These directories hold agent configuration and installed skills, not project code, so excluding them by name matches the existing `.claude` rule and needs no per-project config.

**Code:** `src/core/annotations.ts` → `EXCLUDED_DIRS`, `src/core/annotations.test.ts`, `src/cli/commands.test.ts`

---

### DL-061: Correct the instruction files Cursor and OpenCode read, and place a new rule block where every target harness reads it
*Amends: DL-045, DL-054*

- **Instruction files per harness** (amends DL-054's lists):
  - Cursor reads every file of `[AGENTS.md, CLAUDE.md]` that exists. A harness can now be marked as reading all of its list rather than the first match; Cursor is the only one.
  - OpenCode reads `[AGENTS.md]`.
  - Pi keeps `[AGENTS.md, CLAUDE.md]`, first that exists. Codex and Antigravity keep `[AGENTS.md]`. Claude Code keeps DL-055's model.
- **Placement of a new block** (amends DL-045), when no AGENTS.md or CLAUDE.md holds a block yet:
  1. AGENTS.md, if it exists.
  2. Else CLAUDE.md, if it exists and every harness the block is being installed for reads CLAUDE.md when there is no AGENTS.md. That is Cursor and Pi.
  3. Else a new AGENTS.md. This covers the 0.x upgrade (`--agent claude,codex`) and any CLAUDE.md-only project set up for Codex or OpenCode. Antigravity gets its own rule file (DL-045) and plays no part in placement.
- **Claude Code** is unaffected. With the block in a new AGENTS.md beside an existing CLAUDE.md, Claude Code gets `.claude/rules/dld-workflow.md`, as DL-055 already plans, so each harness loads the rule once.
- **A warning for Pi.** When dld-kit creates AGENTS.md next to an existing CLAUDE.md and Pi is among the harnesses being installed, it warns that Pi now reads AGENTS.md instead of CLAUDE.md, so anything Pi needs from CLAUDE.md must move into AGENTS.md.
- **Existing blocks** are still refreshed where they are (DL-045). A block already in CLAUDE.md still gets DL-054's warning for the harnesses that cannot see it, which now includes OpenCode and no longer includes Cursor.
- **Docs.**
  - The README drops the `touch AGENTS.md` step from "Upgrading from 0.x".
  - Its Agents section describes the new placement, Cursor reading both files, and OpenCode reading only AGENTS.md.
- **Tests.**
  - Unit tests cover the placement for Codex, Cursor, OpenCode and Pi alone and combined, in projects with CLAUDE.md, AGENTS.md, both or neither, including the Pi warning.
  - They also cover Cursor reading a block in either file (no warning), and OpenCode being warned about a block in CLAUDE.md.
  - The 0.x upgrade CLI test runs `update --agent claude,codex` without creating AGENTS.md first, and expects the block in AGENTS.md and only the old-section warning.
- **Refinements during implementation.**
  - A harness is marked with `readsAll` to read every file of its list that exists; Cursor's list is `[AGENTS.md, CLAUDE.md]`.
  - A new block still goes into CLAUDE.md when AGENTS.md exists but is not a regular file, such as a symlink to CLAUDE.md, as before. With no targets named, placement keeps DL-045's order.
  - The Pi warning reads: "dld-kit puts the rule block in a new AGENTS.md. Pi will read AGENTS.md instead of CLAUDE.md from now on, so move anything it needs from CLAUDE.md into AGENTS.md." It is skipped when there is no readable CLAUDE.md for Pi to lose.
  - Only the selected harnesses that take the block count for placement. Antigravity and Claude Code get their own rule files.
  - Rerunning the DL-057 check (a project built with `main`'s 0.x scripts, `update --agent claude,codex`, no AGENTS.md) put the block in a new AGENTS.md and Claude Code's rule in `.claude/rules/dld-workflow.md`. The only warning was about the old CLAUDE.md section.

**Rationale:** A block in a file none of its target harnesses reads is a broken install. Most 1.0 users come from 0.x with a CLAUDE.md, so placement must work for that path.

**Code:** `src/generate/harnesses.ts` → `HARNESSES`, `src/generate/rule.ts` → `blockPlacement`, `switchWarnings`, `instructionFiles`, `src/generate/rule.test.ts`, `src/cli/commands.test.ts`, `tests/cli/cli.test.ts`, `README.md`, `docs/install.md`

---

### DL-062: Merge v1 into main during the release candidates and make each candidate the default install
*Amends: DL-058*

- **Merge `v1` into `main` now** (PR #76). The merge is a fast-forward. `main` becomes the release branch for the remaining candidates and for 1.0.0, and `v1` is retired: CI stops triggering on it.
- **The README says the project is in release candidates.** The "Early development" note is replaced by one saying that 1.0 is in release candidates, which replace the 0.x skills, and that commands, file formats and skills may still change before 1.0.0. It links the last 0.x release, v0.9.0.
- **Each candidate becomes the default install.** After the release workflow publishes a candidate, the maintainer:
  - points the npm `latest` dist-tag at it (`npm dist-tag add dld-kit@<version> latest`);
  - marks its GitHub release as the latest release rather than a prerelease (`gh release edit v<version> --prerelease=false --latest`).

  Both steps stay manual; the workflow is unchanged. `next` keeps pointing at the newest candidate.
- **1.0.0** still waits until the candidates run clean (DL-058). The remaining steps are to release it from `main`, remove the release-candidate note, and mark docs/plan/v1.md as done.
- **Docs.** `docs/releasing.md` names `main` as the release branch, lists the two manual steps, and drops the `#v1` marketplace refs from the per-agent checks. The Codex and Copilot CLI marketplace checks can run on each candidate.
- **Refinements during implementation.**
  - `decisions/PRACTICES.md` names `main` as the branch PRs target.
  - The CI trigger line (`branches: [main]`) carries both DL-058's and DL-062's annotations.

**Rationale:** A working install with known rough edges beats installing a version whose scripts 1.0 replaces, and keeping every channel on the candidate makes them agree on one version.

**Code:** `README.md`, `docs/releasing.md`, `.github/workflows/test.yml`, `decisions/PRACTICES.md`

---

## Documentation (docs)

### DL-063: Restructure the README as a short entry point and move reference material to docs/
*Amends: DL-053, DL-057*

- **The README is an entry point**: what DLD is, how to try it, and links to the details. Target: about 200 lines.
- **Order**: title and pitch, a compact workflow diagram, the release-candidate note (DL-062), contents, Quickstart, How it works, Workflows, Skills, Install, Upgrading from 0.x, Configuration, DLD and spec-driven development, CLI, Learn more, Acknowledgements, License.
- **Quickstart** follows the default install from "Which one to use": `npx dld-kit init`, commit, then `/dld-plan`, `/dld-implement` and `/dld-snapshot`, with how other agents run skills.
- **Install** keeps "Which one to use" and a compact table of channels with their install and update commands. The per-channel details, combining channels, the agents table, the rule placement rules and manual rule setup move verbatim to `docs/install.md`. The duty to mirror `HARNESSES` (DL-041) moves with the agents table.
- **Moved out verbatim**, so nothing is lost:
  - the full upgrade steps to `docs/upgrading-from-0x.md`; the README keeps a short "Upgrading from 0.x" section (DL-057);
  - active and passive workflows, their two images, the scheduler note and the reindex explanation to `docs/workflows.md`;
  - the development section to `CONTRIBUTING.md`;
  - the acknowledgements list to `docs/concept/acknowledgements.md`;
  - the custom snapshot artifact example to `docs/framework/project-configuration.md`. The directory trees and status lifecycle are already in `docs/framework/decision-record-format.md`.
- **CLI** stays in the README, shortened, with its semver contract (DL-056).
- **Diagram**: plan → implement (with review) → snapshot, with the link from code back to decisions, and snapshot shown as something run on demand, on a schedule or in CI. Two SVGs in `docs/assets/`, light and dark, chosen with `<picture>`.
- **Anchors**: removed sections likely to be linked from outside (`combining-channels`, `agents`, `manual-rule-setup`) keep a named anchor on the pointer that replaces them.
- **Voice**: DL-053's language rule stands (plain, concrete, no marketing tone), plus short friendly sentences addressed to "you", one term per concept (agent, not harness), and anything longer than about 30 lines moved to `docs/`.
- **Refinements during implementation.**
  - Image and doc links are relative, which is what GitHub resolves. `docs/` is not in the npm package, so check the npm page with the next candidate, and switch to absolute GitHub URLs if the diagram or links break there.
  - The two SVGs come from one template and differ only in their colours (GitHub's Primer palette). They use system fonts, since GitHub serves images without web fonts.
  - The two existing workflow images move unchanged to `docs/workflows.md`. The sentence on how other agents run skills moves there too, since it introduced the examples that followed it.
  - "Upgrading from 0.x" stays under Install in the README.
  - The README comes to about 200 lines and 1,800 words, down from 447 lines and 4,000 words.

**Rationale:** A reader decides whether to try DLD from the first screen, so it shows what DLD does before install choices; moving text verbatim keeps install accuracy reviewable.

**Code:** `README.md`, `docs/install.md`, `docs/upgrading-from-0x.md`, `docs/workflows.md`, `docs/assets/dld-workflow-light.svg`, `docs/assets/dld-workflow-dark.svg`, `docs/concept/acknowledgements.md`, `docs/framework/project-configuration.md`, `CONTRIBUTING.md`, `CLAUDE.md`

---

## Reindex (reindex)

### DL-064: Reindex commits the renames on top of the branch; squash only on request
*Amends: DL-030, DL-028*

- The default is a new commit on top of the branch. `dld commit-reindex --base <ref>` stages the old and new path of each plan entry plus every tracked file changed since HEAD, and commits. The skill starts from a clean working tree, so those changes are the reindex's own. Untracked files are not staged. The message keeps DL-030's subject and `Renames:` list, without the list of squashed commits.
- Before committing, the skill runs `regenerate-index`, so INDEX.md lists the new IDs and is part of the commit.
- The skill may split a large reindex into several commits: it renames a subset of the plan, reviews that subset's stale mentions, regenerates INDEX.md and pipes the subset into `commit-reindex`. Each commit lists its own renames. One commit is the default. Splitting is for reindexes with many renames, or renames that rewrite many files (annotations, amendments, references); each commit holds one decision or a group of related ones.
- `commit-reindex --squash` keeps DL-030's behavior: squash since the merge-base, leave INDEX.md at its merge-base state, roll back on failure. The skill uses it only when the user asks for a squash, and still asks before force-pushing.
- In both modes, `commit-reindex` refuses a plan entry whose new path does not exist yet (`rename-decision` has not run), before changing anything.
- `find-stale-mentions` fails on an empty plan with the same "no rename plan on stdin" error, instead of printing nothing (DL-028). The skill now pipes plan subsets held in shell variables, and a lost variable must not read as "nothing to review".
- If the default-mode commit fails, the index is restored from the tree saved before staging. HEAD has not moved, so nothing else needs restoring.
- No history is rewritten, so pushing needs no force. The skill asks before pushing.
- The skill's next steps: merge the base into the branch, or merge the PR as usual. Do not rebase: the commits that add the old paths are still on the branch. Teams that rebase, or merge PRs with GitHub's "Rebase and merge", ask for a squash instead.

**Rationale:** A merge only sees end states, so a rename commit on top avoids the collision without a force-push and keeps history and authorship; squashing solves a rebase problem merge workflows do not have.

**Code:** `src/core/commit-reindex.ts` → `commitReindex`, `src/cli/commands/commit-reindex.ts`, `src/core/commit-reindex.test.ts`, `templates/skills/dld-reindex/SKILL.md`, `tests/cli/cli.test.ts`, `src/core/rename.ts` → `findStaleMentions`

---

### DL-065: Records this branch got from an open PR are not collisions with it
*Amends: DL-026, DL-027*

- The open-PR scan also reads each PR's `headRefOid` and returns every claimed ID together with that PR's head commit.
- A record this branch adds does not collide with an open PR's claim when the commit that added the record on this branch (the latest commit in `<base>..HEAD` that adds the path) is the PR's head commit or one of its ancestors. The record came from that PR, so it is the same decision, not a second claim.
- Testing the record's own commit, rather than whether the PR's head is an ancestor of HEAD as PR #53 does, also covers a decisions PR that got more commits after the implementation branch was cut.
- When the PR's head commit is not in the local repository (not fetched, or a fork), ancestry cannot be checked and the claim counts as a collision. The skill runs `git fetch origin` first.
- IDs on the base branch are collisions as before.
- `list-taken-ids`, and the ID allocation in `plan-renames`, still count every claim: a stacked PR's IDs are taken, so new IDs go above them.
- The PR from the current branch is still skipped, per DL-026.

**Rationale:** A collision means two different decisions want one ID; a record inherited from the PR below is one decision, and git ancestry answers that exactly. An unknown head commit is treated as foreign, so a missing fetch can cause a false collision but never hide a real one.

**Code:** `src/core/reindex.ts` → `collides`, `src/core/open-prs.ts` → `openPrIds`, `src/core/reindex.test.ts`, `src/core/open-prs.test.ts`

---

## Decision edits (decision-edits)

### DL-066: Decision prose locks when the record reaches the base branch; frontmatter stays editable

- A record's prose locks when it reaches the base branch, not when it is accepted. A record is **integrated** when its file exists at the merge-base of the base branch and HEAD; otherwise it is a **draft**, whatever its status. Drafts can be edited freely.
- A record that is still `proposed` in its merge-base copy is a draft too. Decisions PRs often merge `proposed` records that are implemented later, and proposed records have always been mutable.
- Frontmatter is editable at every strictness level: `status`, `references`, `amends`, `supersedes`, `tags`, `title` and any other key, except `id` and `timestamp`. Those two are the record's identity and its place in the history, so they are locked with the body (everything after the frontmatter). `decision_edits` decides how strictly the locked parts of an integrated record are protected.
- The base branch is the one `resolve-base` picks (the upstream when it tracks another branch, else `origin/main`). When that is a remote ref that doesn't exist, the local branch of the same name (`main`) is used, so local-only repositories work.
- New internal command `dld check-decision-edits [--base <ref>] [--uncommitted] [DL-NNN ...]`. Without IDs, it prints `<path>\t<DL-NNN>\tedited` for each integrated record whose body, `id` or `timestamp` differs from its merge-base copy (in the working tree, committed or not), and `deleted` for each integrated record that is gone. With IDs, it prints one line per ID, with state `draft`, `integrated`, `edited` or `deleted`. Without IDs, it exits 3 when `decision_edits` is `block` and it printed an `edited` or `deleted` line; with IDs, and otherwise, it exits 0. Errors exit 1, so CI can tell "blocked" from "broken".
- `--uncommitted` compares with HEAD instead of the merge-base, so only uncommitted changes count; whether a record is integrated is still decided at the merge-base. Skills use it at their end step, so they act only on edits made during the run, never on committed edits such as a fix someone made by hand. A record deleted or moved in a commit is not an uncommitted change.
- A record that is gone from its merge-base path but exists in another folder (moved between namespaces) is followed by its ID and compared at its new path. It is `deleted` only when the ID is gone everywhere.
- Bodies are compared as text after the frontmatter, with CRLF read as LF and trailing whitespace at the end of the file ignored. `id` and `timestamp` are compared as parsed values; when the working copy's frontmatter can't be parsed, the whole frontmatter is compared, so a broken edit is reported.

**Rationale:** Whether the team has the record is what makes it history, and the base branch answers that where status cannot. Frontmatter is bookkeeping, and a git diff against the merge-base detects edits exactly.

**Code:** `src/core/decision-edits.ts` → `checkDecisionEdits`, `editBase`, `src/cli/commands/check-decision-edits.ts`, `src/core/decision-edits.test.ts`

---

### DL-067: decision_edits setting: block (default), ask or allow for integrated decision prose
*Amends: DL-009*

- `dld.config.yaml` gets an optional key `decision_edits` with three values. It only governs the body of integrated records (DL-066); drafts and frontmatter are always editable.
  - `block` (the default): the agent never edits the body of an integrated record, even when asked. It records an amendment or a superseding decision instead, and tells the user the setting can be loosened. People can still edit records by hand.
  - `ask`: the agent may edit it after the user confirms, per record, with `AskUserQuestion`. Otherwise it amends or supersedes.
  - `allow`: the agent may edit it when that keeps the record accurate, and lists the edits in its summary.
- `dld-audit-auto` behaves as `block` at every level: nobody is there to ask.
- An edit to an integrated body follows `dld-adjust`'s writing rules: the record reads as a clean document, with no "updated on" or "previously" notes. Git keeps the old text.
- Any other value is a config error naming the three allowed values.

**Rationale:** `block` keeps the history trustworthy by default, `ask` keeps a human in the loop for legitimate fixes, and `allow` serves teams that treat records as living documentation.

**Code:** `src/core/config.ts` → `decisionEdits`, `src/cli/commands/check-decision-edits.ts`, `docs/framework/project-configuration.md`

---

### DL-068: Rule line and skill end steps that check edits to integrated decisions

- The always-on rule gets one line: records not yet on the base branch (or still `proposed` there) are drafts and can be edited, frontmatter except `id` and `timestamp` can always be updated, and the prose of records on the base branch is changed only through `dld-adjust`, which follows `decision_edits` (spelled out in the line: `block` amends or supersedes instead, `ask` asks first, `allow` edits).
- `dld-adjust` decides whether to ask using `check-decision-edits <ID>` (draft or integrated) and `decision_edits`, replacing its "pushed to any remote branch" test. Deprecated and superseded drafts are edited like any other draft.
- `dld-implement`, `dld-adjust`, `dld-decide`, `dld-plan` and `dld-audit-auto` run `check-decision-edits --uncommitted` as a last step, so they never undo committed edits. A listed edit the agent didn't make (the user's hand edit) is left alone and mentioned. Under `block`, `dld-adjust` stops after any frontmatter-only part of the request. When it lists records, the agent acts on `decision_edits`: under `block` it restores the body with `dld restore-decision-prose --uncommitted <DL-NNN>...` and records an amendment instead if the change is still needed; under `ask` it asks; under `allow` it lists the edits in its report. `dld-audit-auto` always restores.
- The README, the record-format spec, the configuration spec, the concept docs and the FAQ say "immutable once integrated" instead of "immutable once accepted", and document `decision_edits`.
- New internal command `dld restore-decision-prose [--base <ref>] [--uncommitted] <DL-NNN>...`: puts back the body, `id` and `timestamp` of each integrated record as they are at the merge-base (at HEAD with `--uncommitted`), keeping the rest of the current frontmatter, the record's current folder and its line endings. A deleted record is restored whole and staged. It refuses drafts, including records still `proposed` at the merge-base, before writing anything. Restoring by hand from `git show` is easy to get wrong when the frontmatter also changed.
- `dld-implement` no longer calls an `accepted` record immutable while it is still a draft.

**Rationale:** The rule line reaches ordinary sessions where unwanted edits happened, the skill end steps catch edits when work is called done, and one command gives every skill the same answer.

**Code:** `templates/rules/dld-workflow.md`, `templates/skills/dld-adjust/SKILL.md`, `templates/skills/dld-implement/SKILL.md`, `templates/skills/dld-audit-auto/SKILL.md`, `templates/skills/dld-decide/SKILL.md`, `templates/skills/dld-plan/SKILL.md`, `src/core/decision-edits.ts` → `restoreDecisionProse`, `src/cli/commands/restore-decision-prose.ts`

---

## Annotations (annotations)

### DL-069: Skip oversized and unreadable files in the annotation scan, and report them
*Amends: DL-019*

- Files larger than 16 MB are skipped without being read. The cap is a constant (`MAX_SCAN_BYTES`), not a config key.
- `Context.fs` gains `fileSize`, which reads the size without following symlinks, so the check happens before the read.
- A listed file that fails to read (any `FsError`, including ERR_STRING_TOO_LONG and EACCES) is skipped instead of aborting the scan. Other errors still propagate, since they are bugs.
- Skipped files are reported, not dropped silently: `scanAnnotations` and `missingAnnotations` take an optional `onSkip` callback, and `verify-annotations` and `find-annotations` print one line per skipped file on stderr: `Warning: skipped <file> (<reason>); annotations in it are not counted`. Stdout and exit codes are unchanged.
- Binary files are still skipped silently, as DL-019 says.

**Rationale:** A source file over 16 MB is almost certainly generated or data, and a cheap size check avoids loading it. One unreadable file should not block the check for the whole project, and reporting it keeps a false MISSING explainable.

**Code:** `src/core/annotations.ts` → `scanAnnotations`, `MAX_SCAN_BYTES`, `src/core/context.ts` → `FileSystem`, `src/node-context.ts` → `nodeFileSystem`, `src/cli/commands/verify-annotations.ts`, `src/cli/commands/find-annotations.ts`, `src/core/annotations.test.ts`

---

## Snapshot (snapshot)

### DL-070: Include proposed decisions in the snapshot, apart from accepted ones
*Amends: DL-025, DL-021*

- `/dld-snapshot` includes `proposed` decisions in `SNAPSHOT.md` and `OVERVIEW.md`, kept apart from accepted ones:
  - `SNAPSHOT.md` lists them after all accepted groups, under `## <Group> (proposed)` headings, with the same per-decision format.
  - `OVERVIEW.md` keeps its present-tense narrative to accepted decisions and describes proposed ones only in a closing `## Planned Direction` section, cited as `(DL-NNN, proposed)`. The section is omitted when nothing is proposed.
  - Custom artifacts receive proposed records too, and treat them as planned work.
  - A log with only proposed decisions can be snapshotted.
- `collect-active-decisions --include-proposed` prints accepted and proposed records together, in ascending ID order, in the DL-025 format. Without the flag the command is unchanged.
- `update-snapshot-state` sets `decisions_included` to the highest accepted or proposed ID, and writes `includes_proposed: true` to the `snapshot` section of `.dld-state.yaml`.
- `detect-snapshot-changes` reports as new the accepted and proposed records numbered above `decisions_included`. When the `snapshot` section has no `includes_proposed`, the last snapshot predates this decision, so every proposed record is reported as new as well. Modified decisions keep the DL-025 rule, which now also catches proposed records that were accepted, edited or deleted.

**Rationale:** A separate section keeps the accepted part of both documents an accurate statement of current state while showing where the system is headed. Counting proposed records in `decisions_included`, plus an upgrade marker, keeps incremental detection exact.

**Code:** `src/core/snapshot.ts` → `collectActiveDecisions`, `detectSnapshotChanges`, `updateSnapshotState`, `src/cli/commands/collect-active-decisions.ts` → `collectActiveDecisionsCommand`, `src/core/snapshot.test.ts`, `templates/skills/dld-snapshot/SKILL.md`
