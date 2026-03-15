---
name: dld-audit-auto
description: Autonomous audit — detects drift, fixes issues, and opens a PR. Designed for scheduled/CI execution without human interaction.
compatibility: Requires bash and git. Scripts use BASH_SOURCE for path resolution.
---

# /dld-audit-auto — Autonomous Audit & Fix

You are running an autonomous audit of the decision-code relationship. Unlike the interactive `/dld-audit`, you **detect issues and fix them** without asking for human input. Your output is a branch with fixes and a PR for review.

**This skill is designed for unattended execution** — scheduled runs, CI pipelines, or autonomous agent sessions. Do not ask questions or wait for user input.

## Script Paths

Shared scripts:
```
../dld-common/scripts/common.sh
../dld-common/scripts/regenerate-index.sh
../dld-common/scripts/update-status.sh
```

Skill-specific scripts:
```
../dld-audit/scripts/find-annotations.sh
../dld-audit/scripts/find-missing-amends.sh
../dld-audit/scripts/update-audit-state.sh
```

## Prerequisites

1. Check that `dld.config.yaml` exists at the repo root. If not, exit with a clear error message.
2. Verify the working tree is clean (`git status --porcelain` should be empty). If not, exit — do not mix audit fixes with uncommitted work.

## Step 1: Create audit branch

```bash
git checkout -b dld/audit-$(date +%Y%m%d-%H%M%S)
```

## Step 2: Run the full audit

Perform all the same checks as `/dld-audit`:

### a) Collect annotations and decision records

```bash
bash ../dld-audit/scripts/find-annotations.sh
```

Read all `DL-*.md` files in the records subdirectory (`decisions/records/`). Note each decision's ID, status, and code references.

### b) Detect issues

Check for all drift categories:

1. **Orphaned annotations** — annotations referencing non-existent decision IDs
2. **Annotations referencing non-accepted decisions** — code tied to deprecated or superseded decisions
3. **Stale references in decisions** — frontmatter references to files that no longer exist
4. **Unreferenced code changes** — annotated files modified since last audit (if previous audit state exists)
5. **Decisions without annotations** — accepted decisions with code references but no corresponding annotations in code
6. **Missing amendment relationships** — decisions whose body references modifying part of a previous decision but have an empty `amends` field

For check (4), if `decisions/.dld-state.yaml` exists with an `audit.commit_hash`, first verify reachability:
```bash
git cat-file -t <commit_hash> 2>/dev/null
```
If unreachable (e.g., after rebase or shallow clone), skip check (4) and note it in the PR description. If reachable, use `git diff --name-only <commit_hash>..HEAD` to find changed files and cross-reference with annotated files.

## Step 3: Fix issues

Apply fixes for each issue category. Use judgment on what can be safely fixed automatically vs. what should only be flagged in the PR description.

### Auto-fixable (apply these directly):

**Orphaned annotations** — If the annotation has an obvious typo (e.g., `DL-01` where `DL-001` exists), fix it. If the referenced ID is completely unknown, remove the annotation and note the removal in the commit message.

**Stale references in decisions** — Remove file paths from the decision's `references` field that no longer exist. If the file was renamed/moved (detectable via `git log --follow --diff-filter=R`), update the path instead of removing.

**Annotations referencing superseded decisions** — Update the annotation to reference the superseding decision (read the `supersedes` field of the newer decision to find the chain). For deprecated decisions, remove the annotation.

**Annotations referencing amended decisions** — Do **not** rewrite or remove these annotations. The original decision is still active. Instead, note the amendment relationship in the PR description so reviewers can verify the code aligns with the amendment.

**Missing amendment relationships** — Run `bash ../dld-audit/scripts/find-missing-amends.sh` to get candidates. For each candidate, read the source decision's body and determine if it describes a partial modification. If so, add the referenced ID to the `amends` field. Flag prominently in the PR for review, since this is an inferred relationship.

**Decisions without annotations** — If an accepted decision has code references but no annotations, and the referenced files exist, add the missing `@decision(DL-NNN)` annotations to the referenced code locations.

### Best-effort fixes (apply, but flag prominently for review):

**Unreferenced code changes** — Annotated files that were modified since the last audit without a corresponding decision update. These represent changes made outside the DLD process. Try to resolve them:

1. **Check commit messages** — Read the commits that modified the file (`git log --oneline <last_audit_hash>..HEAD -- <file>`). Look for context about what changed and why.
2. **Look up referenced tickets** — If commit messages reference a ticket (e.g., Jira, Linear, GitHub issue), try to look it up using available tools (MCP servers, `gh` CLI, etc.) to gather additional context about the change.
3. **Assess the impact** — Read the current code and the associated decision(s). Determine whether:
   - The existing decision is still accurate (the change was compatible — no action needed)
   - The existing decision needs a minor update (refine the decision record)
   - A new decision is needed (the change introduced new behavior not covered by existing decisions)
4. **Create or update decisions** — Based on the assessment, either update the existing decision record or create a new decision using the standard scripts. Add `@decision` annotations to the new/changed code. Mark any new decisions as `accepted` since the code already exists.

**Important:** These best-effort fixes are inferred, not authoritative. In the PR description, clearly mark each one under a **"Inferred Decisions — Review Required"** section. Explain what changed, what context was found (commit messages, tickets), and what decision was created or updated. Reviewers should prioritize checking these for accuracy.

## Step 4: Regenerate INDEX.md

If any decision records were modified:
```bash
bash ../dld-common/scripts/regenerate-index.sh
```

## Step 5: Update audit state

```bash
bash ../dld-audit/scripts/update-audit-state.sh
```

## Step 6: Commit, push, and open PR

If there are changes (fixes were applied or audit state was updated):

```bash
git add -A
```

Commit with a descriptive message summarizing the fixes:

```bash
git commit -m "fix: resolve DLD audit drift

- [list each fix applied]
- Audit state updated"
```

Push and open a PR:

```bash
git push -u origin HEAD
```

Create a PR with the following structure:

```markdown
## DLD Audit — Automated Drift Fixes

**Audit date:** YYYY-MM-DD
**Issues found:** N
**Auto-fixed:** M
**Needs review:** K

### Fixes Applied

- [Description of each fix, grouped by category]

### Inferred Decisions — Review Required

These decisions were created or updated based on code changes made outside the DLD process. The rationale was inferred from commit messages and available ticket context. **Please verify accuracy.**

- **DL-NNN: [Title]** (new/updated) — [What changed in the code, what context was found, what was inferred]

### Audit Summary

| Check | Result |
|-------|--------|
| Orphaned annotations | N found, M fixed |
| Stale references | N found, M fixed |
| Superseded/deprecated refs | N found, M fixed |
| Missing annotations | N found, M added |
| Modified annotated files | N flagged for review |
```

If no issues were found (only audit state updated), still commit and push the state update but **do not open a PR**. Instead, exit with a message:

```
Audit complete. No drift detected. Audit state updated.
```
