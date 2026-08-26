# TypeScript core and the npm package direction

**Status:** direction document. Individual steps get their own decision records as we implement them. This document is the input to those decisions, not a decision itself.

## Where we are

dld-kit's state layer is bash: ten scripts under `skills/dld-run/scripts/` plus shared utilities in `dld-common/scripts/`, owning every mutation of `.dld/runs/` and `decisions/`. Both harness extensions (pi, OpenCode) shell out to these scripts through an exec shim. The skills reference script paths directly. Tests are bats (305 of them) running subprocess fixtures.

This works. It has also produced a recognizable set of costs:

- **Two languages, one toolkit.** The extensions are TypeScript; the state layer is bash. Every crossing of that boundary pays a tax: argv serialization, quoting discipline, exit-code envelopes, stderr passthrough, and the exec shim itself.
- **The boundary is where the bugs live.** The OpenCode spike's review findings cluster on the seam: shell injection through naive quoting, exit-code ambiguity (is exit 1 "no run" or "script broke"?), timeout and buffer limits presenting as verification failures, sync spawns blocking a server event loop.
- **Testability is capped.** bats tests are integration tests by construction — every assertion goes through a subprocess, a temp git repo, and jq. PRACTICES.md prefers DI and colocated unit tests; the script layer is the biggest violator.
- **Distribution is copy-based.** Skills ship as files copied into `.claude/skills/` or referenced from a tessl plugin. There is no versioned artifact a user installs and upgrades.

## The direction

Two moves, in sequence.

### Move 1: `dld-core` — a shared TypeScript module

Extract the pure, harness-agnostic code that already exists into `extensions/dld-core/`: the state reader (`run-state.ts`), path resolution (`paths.ts`), the render functions (`render.ts`), the start-args parser, and project-root resolution. Both extensions import from it. Pi ignores the directory (no `index.ts`); OpenCode imports files directly.

The important design constraint: **`dld-core`'s API is function-shaped, not script-shaped.** Extensions call `readRunState(runDir)` and eventually `setItemStatus(slug, index, status)` — not `runScript("run-state.sh", [...])`. The bash scripts remain the implementation behind the mutation functions for now.

This is the strangler-fig pattern: a new API in front, the old implementation behind it, and the rewrite happens underneath without touching callers.

### Move 2: the state layer becomes TypeScript, and dld-kit becomes an npm package

The bash scripts are rewritten as TypeScript inside what is now `dld-core`. The package publishes to npm with a global CLI, following the OpenSpec model:

```
npm install -g dld-kit
dld init              # bootstrap DLD in a repo
dld decide            # record a decision
dld run start DL-014..DL-022
dld run status
```

The extensions stop shelling out entirely — they import the library. The skills' script references become CLI invocations (for harnesses that only speak markdown) or library concepts (for harnesses with real extension APIs). The bats suite retires in favor of bun tests against real functions; a smaller set of CLI integration tests covers the command surface.

The dual-copy skill problem (`.claude/skills/` vs `skills/`) collapses: skills become thin prompt layers over the CLI, and the CLI is the single implementation.

## Why this order

Move 1 without Move 2 is still worth doing: it kills the drift-between-copies problem (three copies of `parseStartArgs` existed within weeks), gives the OpenCode plugin real shape validation, and unlocks maxMinutes enforcement on OpenCode via `activeMinutes`.

Move 2 without Move 1 is a bigger bang with no migration path. Doing Move 1 first means the extensions are already written against the API that Move 2 implements — the rewrite is invisible to them.

## What changes for users

- **Today:** clone or tessl-install dld-kit, skills reference script paths, bash + jq required.
- **After Move 1:** nothing. Internal refactor.
- **After Move 2:** `npm i -g dld-kit` replaces the clone. Node/Bun becomes a runtime requirement where bash + jq was. The skills get thinner; the CLI gets real.

Node is a defensible requirement: every harness dld-kit targets (pi, OpenCode, Claude Code via its tooling) already assumes a JS runtime. Bash purity was the right call for the initial skill-only distribution; it stops being right once extensions exist.

## What this means for 1.0

The npm package is the 1.0 distribution story. A 1.0 that ships copy-based skills and a bash state layer locks in the boundary this document exists to remove. The sequencing question — whether 1.0 waits for Move 2 — is a decision for later, recorded separately.

## Non-goals

- **Rewriting the skills' prompt content.** SKILL.md files stay markdown; what changes is what they reference.
- **A plugin marketplace or registry.** npm is the registry.
- **Abandoning harness-specific UX.** The pi extension's layered UI and the OpenCode plugin's slots stay per-harness. Only the state layer unifies.

## Open questions (for future decisions)

- CLI command surface: does `dld` mirror the skill names (`dld decide`, `dld plan`, `dld run`) or the script names?
- Does the npm package bundle the skills and install them into `.claude/skills/` / `.opencode/` on `dld init`, or does each harness keep its own install path?
- Bun vs Node as the target runtime. The extensions run under bun (pi's jiti, OpenCode's runtime); a global CLI has to work under both.
- What happens to `dld-common/scripts/` utilities that other tools (not the extensions) call directly — `next-id.sh`, `regenerate-index.sh`, `update-status.sh`. They become CLI subcommands or library exports, but the mapping isn't one-to-one.
- Versioning: the run contract has `schemaVersion: 1`. The npm package makes version upgrades real in a way copy-based distribution never did — migration policy becomes a first-class concern.
