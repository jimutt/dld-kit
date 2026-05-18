---
name: dld-reindex
description: Resolve decision ID collisions between a local branch and the base branch (and open PRs) before rebasing. Renames colliding local decisions with git mv, rewrites cross-references and annotations, regenerates INDEX.md, and optionally commits.
compatibility: Requires bash and git. Open-PR scanning additionally needs the `gh` CLI authenticated against a GitHub remote — the skill falls back gracefully when unavailable.
---

# /dld-reindex — Resolve Decision ID Collisions

You are helping the developer untangle decision ID collisions before they rebase. Two or more developers can draft `DL-NNN` decisions in parallel; once one of them lands on the base branch (or appears in an open PR), the others must rename their local copies to the next free ID. This skill handles that mechanically so you don't lose history, annotations, or cross-references.

**This skill must run before rebasing.** Do not bring remote changes in first — that turns a clean rename into a merge conflict.

## Interaction style

Use the `AskUserQuestion` tool when prompting for the commit decision at the end. Everything else is deterministic and runs without user input.

## Script Paths

Shared scripts:
```
../dld-common/scripts/common.sh
../dld-common/scripts/regenerate-index.sh
```

Skill-specific scripts:
```
scripts/find-collisions.sh
scripts/list-taken-ids.sh
scripts/rename-decision.sh
```

## Prerequisites

1. Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.
2. Verify the working tree is clean (`git status --porcelain` empty). If not, ask the user to commit or stash first, then stop.
3. Determine the base branch. Prefer the upstream of the current branch:
   ```bash
   git rev-parse --abbrev-ref --symbolic-full-name @{upstream}
   ```
   If there is no upstream, default to `origin/main`. The user can override by passing a base ref to this skill (e.g. `/dld-reindex origin/develop`).
4. Fetch the base ref so collision detection sees the latest state:
   ```bash
   git fetch origin
   ```

## Step 1: Detect collisions

```bash
bash scripts/find-collisions.sh --base "$BASE"
```

The output is one line per collision: `<relative-path>\t<DL-NNN>`. If there is no output, exit with:

> No ID collisions detected. Safe to rebase onto `$BASE`.

The same script's underlying `list-taken-ids.sh` may print a stderr note like `[dld-reindex] open PRs not scanned: gh CLI not installed`. **Always surface this to the user** so they know the renamed IDs were chosen against base-branch state only and may still collide with an open PR.

## Step 2: Compute the next free IDs

Collect the inputs:

- `TAKEN` — output of `bash scripts/list-taken-ids.sh --base "$BASE"`. IDs already used on the base branch (and on open PRs when `gh` is available).
- `LOCAL_KEPT` — local-added decision IDs that are NOT in the collision list. These are IDs the user is keeping; they must not be reassigned to anything else.

Compute the highest numeric ID across `TAKEN ∪ LOCAL_KEPT`. Assign the next sequential IDs (`max + 1`, `max + 2`, …) to the colliding decisions **in numeric order**, padded with `printf "DL-%03d"`.

## Step 3: Apply renames

For each colliding decision (in order), call:

```bash
bash scripts/rename-decision.sh --old DL-OLD --new DL-NEW --path <relative-path> --base "$BASE"
```

`rename-decision.sh` does all of the following in one call:

- `git mv` the file from `DL-OLD.md` to `DL-NEW.md` (preserves rename history).
- Patches the `id:` frontmatter field in the renamed file.
- Rewrites `DL-OLD` mentions inside the renamed file's body (so internal cross-references survive the rename).
- Rewrites `DL-OLD` mentions inside OTHER locally-added/modified decision files (frontmatter `supersedes` / `amends` / `references` and body). It scopes this to the local change set vs the base ref, so it never touches decisions that already existed on the base.
- Rewrites `` `@decision` ``(DL-OLD) annotations to `` `@decision` ``(DL-NEW) in non-decision files that are part of the local change set.

The substitution is digit-aware: renaming `DL-100` will not accidentally rewrite `DL-1000`.

## Step 4: Regenerate INDEX.md

Pass `--include-base` so the regenerated INDEX merges in decisions that exist on the base branch but not yet locally. Without this flag, the regenerated INDEX would only contain rows the branch knows about, and the subsequent rebase would conflict with main's INDEX rows for decisions added on main since the branch diverged.

```bash
bash ../dld-common/scripts/regenerate-index.sh --include-base "$BASE"
```

## Step 5: Ask about committing

Present the rename table to the user (old ID → new ID, one row per rename) and ask via `AskUserQuestion`:

> How should I finish this reindex?

Options (single-select):

- **Commit and push** — agent runs `git add -A && git commit && git push`.
- **Commit only** — agent runs `git add -A && git commit`, leaves the push to the user.
- **Leave for me** — agent stages nothing further; the working-tree state stays as rename-decision.sh left it (the `git mv`'s already register the renames in the index).

For "Commit and push" / "Commit only", use this commit message format:

```
reindex local decisions: DL-OLD1 -> DL-NEW1, DL-OLD2 -> DL-NEW2
```

For more than three renames, summarize as `reindex N local decisions to avoid base-branch collisions` and put the full table in the body.

## Step 6: Report

Print:

- The renames table (always).
- The stderr note from step 1 if `gh` was skipped (always — even if the user chose to commit).
- The next-step hint:

> Next step: `git rebase $BASE`

The skill never rebases or merges — that is always the user's call.

## Out of scope

- **Already-conflicted rebases.** This skill is pre-rebase only. If the user is mid-rebase with conflicts, tell them to `git rebase --abort` first and re-run this skill.
- **Cross-namespace ID reconciliation** in namespaced projects. IDs are assumed globally unique across namespaces, matching `next-id.sh`.
