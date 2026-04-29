---
name: dld-audit
description: Scan for drift between decisions and code. Finds orphaned annotations, stale references, and undocumented changes.
compatibility: Requires bash and git. Scripts use BASH_SOURCE for path resolution.
---

# /dld-audit — Audit Decision-Code Drift

You are scanning the codebase for drift between decision records and code annotations. This helps catch situations where code evolved but decisions weren't updated.

## Script Paths

Shared scripts:
```
../dld-common/scripts/common.sh
```

Skill-specific scripts:
```
scripts/find-annotations.sh
scripts/find-missing-amends.sh
scripts/update-audit-state.sh
```

## Prerequisites

Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.

## Audit Steps

### 1. Collect all annotations in code

Run the find-annotations script:
```bash
bash scripts/find-annotations.sh
```

This outputs lines in the format `<file>:<line>:<DL-NNN>`, one per annotation occurrence.

### 2. Collect all decision records

Read all `DL-*.md` files in the records subdirectory (`decisions/records/`). For each, note:
- The ID
- The status
- The code references listed in the frontmatter

### 3. Check for issues

Perform these drift checks:

#### a) Orphaned annotations

Annotations in code that reference non-existent decision IDs. These indicate decisions that were deleted or IDs that were mistyped.

#### b) Annotations referencing non-accepted decisions

Annotations referencing decisions with status `deprecated` or `superseded`. Code is still tied to a decision that's no longer active.

#### b2) Annotations referencing amended decisions

Annotations referencing decisions that have been amended by a newer decision (check all decisions for `amends` fields that reference this ID). This is **informational, not an error** — the original decision is still active, but the developer should be aware of the amendment. Surface these as notes, not issues.

#### c) Stale references in decisions

Decision records whose `references` list code paths that no longer exist in the repository. Use file existence checks.

#### d) Unreferenced code changes (if previous audit exists)

If `decisions/.dld-state.yaml` exists and has an `audit.commit_hash`, find files that:
1. Contain `@decision` annotations
2. Were modified since the last audit commit

First, verify the commit is reachable:
```bash
git cat-file -t <commit_hash> 2>/dev/null
```

If the commit is unreachable (e.g., after a rebase or shallow clone), skip this check and note it in the report:
> **Note:** Previous audit commit `<hash>` is not reachable in current history. Skipping changed-file detection. This can happen after a rebase or shallow clone.

If the commit is reachable:
```bash
git diff --name-only <commit_hash>..HEAD
```

Cross-reference this list with annotated files. Files that changed but whose associated decisions weren't updated may indicate undocumented drift.

#### e) Missing amendment relationships

**This check is mandatory — do not skip it.** Run the find-missing-amends script to get initial candidates:

```bash
bash scripts/find-missing-amends.sh
```

This outputs lines in the format `<source-id>:<referenced-id>` — decisions whose body references another decision ID that isn't listed in their `supersedes` or `amends` fields. Not every candidate is a missing amendment — some are just informational references (e.g., "this is similar to DL-005").

By default the script only emits candidates whose source decision file changed since the last audit (recorded in `.dld-state.yaml`), so references the agent has already evaluated and judged informational don't keep resurfacing. To force a full rescan — useful for cold starts or manual deep audits — pass `--all`:

```bash
bash scripts/find-missing-amends.sh --all
```

For each candidate, read the source decision's body and evaluate whether the reference describes a partial modification of the referenced decision. Look for language like: "supersedes the X portions of", "changes the Y behavior from DL-Z", "replaces the approach in DL-Z for...", "modifies how DL-Z handles...". If so, flag it as a missing amendment.

#### f) Decisions without annotations

`accepted` decisions that have code references in their frontmatter but no corresponding `@decision` annotations found in the code. The references claim code is linked, but the annotations are missing.

### 4. Report findings

Present findings grouped by severity:

```
## Audit Report

### Issues Found

#### Orphaned Annotations
- `src/billing/vat.ts:42` references `DL-099` — decision does not exist

#### Stale References
- **DL-012** references `src/billing/old-vat.ts` — file does not exist

#### Deprecated/Superseded References
- `src/auth/login.ts:15` references `DL-003` (status: superseded by DL-012)

#### Amended Decisions (informational)
- `src/billing/vat.ts:42` references `DL-003` — amended by DL-012. Verify code aligns with the amendment.

#### Modified Annotated Files (since last audit)
- `src/billing/vat.ts` — modified, contains `@decision(DL-012)`. Review if decision needs updating.

### Summary
- **X** orphaned annotations
- **Y** stale references
- **Z** annotated files modified since last audit

### Suggested Remediation
- Fix orphaned annotation at `src/billing/vat.ts:42` — update to correct ID or remove
- Update DL-012 references — remove `src/billing/old-vat.ts`
- Review `src/billing/vat.ts` changes — consider `/dld-decide` if behavior changed
```

If no issues are found:
```
## Audit Report

No drift detected. All annotations reference valid, accepted decisions. All decision references point to existing code.
```

### 5. Update audit state

After the audit completes (regardless of findings):
```bash
bash scripts/update-audit-state.sh
```

### 6. Suggest next steps

> Audit complete. **N** issue(s) found.
>
> Next steps:
> - Fix any orphaned or stale references identified above
> - `/dld-decide` — record new decisions for undocumented changes
> - `/dld-snapshot` — regenerate the spec projection
> - `/dld-status` — view overall decision log state
