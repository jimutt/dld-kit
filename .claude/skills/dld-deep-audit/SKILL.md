---
name: dld-deep-audit
description: Full from-scratch audit with semantic verification. Reads every accepted decision and its referenced code to assess whether intent and implementation still align.
user_invocable: true
---

# /dld-deep-audit — Deep Audit with Semantic Verification

You are performing a thorough, from-scratch audit of the decision-code relationship. Unlike `/dld-audit` (which uses `.dld-state.yaml` for incremental checks), this skill ignores all cached state and scans everything fresh. It also goes beyond structural checks to verify that code still **semantically** reflects decision intent.

**When to use:** After rewritten git history, after a burst of implementation changes, or as a periodic health check.

**Important:** This audit does NOT update `.dld-state.yaml`. The incremental audit state used by `/dld-audit` is unaffected. The two tools are orthogonal.

## Prerequisites

Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.

Read `dld.config.yaml` to get:
- `decisions_dir` (default: `decisions`)
- `annotation_prefix` (default: `@decision`)
- `mode` (flat or namespaced)

## Phase 1 — Structural Audit

### Step 1. Collect all annotations in code

Use the Grep tool to find all `@decision(DL-NNN)` patterns in the codebase.

- **Pattern:** `@decision\(DL-[0-9]+\)` (adjust prefix based on `annotation_prefix` config)
- **Exclude directories:** `.git`, `.claude`, `.tessl`, `node_modules`, `vendor`, `.venv`, `__pycache__`, `target`, `dist`, `build`, `.next`, `coverage`, and the decisions directory itself
- **Exclude files:** `*.lock`, `*.min.js`, `*.min.css`, `*.map`

Record each match as `file:line:DL-NNN`.

### Step 2. Collect all decision records

Read all `DL-*.md` files in the records subdirectory (`decisions/records/`, including namespace subdirectories if namespaced). For each, note:
- The ID
- The status
- The title
- The code references listed in frontmatter
- The `supersedes` field

### Step 3. Structural checks

Perform these drift checks:

#### a) Orphaned annotations

Annotations in code that reference non-existent decision IDs. These indicate decisions that were deleted or IDs that were mistyped.

#### b) Annotations referencing non-accepted decisions

Annotations referencing decisions with status `deprecated` or `superseded`. Code is still tied to a decision that's no longer active.

#### c) Stale references in decisions

Decision records whose `references` list code paths that no longer exist in the repository. Use file existence checks.

#### d) Missing annotations

`accepted` decisions that have code references in their frontmatter but no corresponding `@decision` annotations found in the code. The references claim code is linked, but the annotations are missing.

#### e) Reference mismatches (bidirectional consistency)

Check both directions:
- An annotation `@decision(DL-NNN)` exists in file X, but DL-NNN does not list file X in its `references` field
- DL-NNN lists file X in its `references`, and the annotation exists, but with a different symbol than specified

This is a stricter check than `/dld-audit` performs — it validates that the decision's view of the code and the code's view of the decision are consistent.

## Phase 2 — Semantic Verification

### Step 4. Identify verification candidates

Filter to accepted decisions that have at least one entry in `references`. These are the decisions that make verifiable claims about code. List them.

If there are no candidates, skip to Phase 3 and note that no semantic verification was possible.

### Step 5. Verify semantic alignment

For each candidate decision:

1. **Read the full decision record** — Context, Decision, Rationale, and Consequences sections
2. **Read each referenced code file.** If the `symbol` field is present, locate that specific function, class, or method. If the symbol cannot be found in the file, flag it as a structural issue.
3. **Assess alignment** along these dimensions:
   - Does the code implement what the **Decision** section describes?
   - Are the constraints/context mentioned in **Context** still valid?
   - Has the code evolved beyond what the decision covers (new behavior, changed approach)?
   - Do the trade-offs described in **Consequences** still hold?
4. **Classify** the finding:
   - **Aligned** — code matches decision intent, no action needed
   - **Drifted** — code has partially evolved beyond or away from the decision. The decision is still mostly accurate but needs updating or a supplementary decision
   - **Diverged** — code fundamentally no longer reflects the decision. The decision should be superseded
5. For **Drifted** and **Diverged** findings, write a concrete remediation suggestion explaining what changed and what action to take

## Phase 3 — Report

### Step 6. Generate the deep audit report

Present the report in this format:

```
## Deep Audit Report

**Date:** YYYY-MM-DD
**Scope:** Full codebase (from scratch, no incremental state)
**Decisions scanned:** N total (M accepted with code references)

---

### Part 1: Structural Findings

#### Orphaned Annotations
- `src/billing/vat.ts:42` references `DL-099` — decision does not exist

#### Stale References
- **DL-012** references `src/billing/old-vat.ts` — file does not exist

#### Annotations on Non-Active Decisions
- `src/auth/login.ts:15` references `DL-003` (status: superseded by DL-012)

#### Missing Annotations
- **DL-005** references `src/auth/session.ts` but no `@decision(DL-005)` annotation found in that file

#### Reference Mismatches
- `src/api/handler.ts:20` has `@decision(DL-010)` but DL-010 does not list this file in its references

---

### Part 2: Semantic Verification

#### Aligned (N decisions)
These decisions accurately reflect their referenced code:
- DL-001, DL-003, DL-008, DL-015

#### Drifted (N decisions)

**DL-007: [Title]**
- **Decision states:** [summary of what was decided]
- **Code now does:** [what the code actually does]
- **Suggestion:** Record a supplementary decision via `/dld-decide` covering [specific change]

#### Diverged (N decisions)

**DL-012: [Title]**
- **Decision states:** [summary]
- **Code now does:** [fundamental mismatch]
- **Suggestion:** DL-012 should be superseded. Record a new decision via `/dld-decide` that reflects the current implementation

---

### Part 3: Summary

| Category | Count |
|----------|-------|
| Structural issues | N |
| Semantically aligned | M |
| Semantically drifted | K |
| Semantically diverged | J |

### Remediation Priorities

1. [Highest-priority item with specific decision IDs and file paths]
2. [...]
```

If no issues are found:
```
## Deep Audit Report

**Date:** YYYY-MM-DD
**Scope:** Full codebase (from scratch)

No structural or semantic issues detected. All accepted decisions with code references accurately reflect their referenced code.
```

Omit any section that has zero findings (e.g., if there are no orphaned annotations, skip that subsection entirely).

### Step 7. Suggest next steps

```
> Deep audit complete. **N** structural issue(s), **M** semantic concern(s) found.
>
> Next steps:
> - Address diverged decisions first — these need new decisions via `/dld-decide`
> - Fix structural issues (orphaned annotations, stale references)
> - `/dld-audit` — run the incremental audit to reset the baseline
> - `/dld-snapshot` — regenerate the spec projection if decisions were updated
```
