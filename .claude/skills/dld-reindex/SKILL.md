---
name: dld-reindex
description: Resolve decision ID collisions between a local branch and the base branch (and open PRs) before rebasing. Renames colliding local decisions with git mv, rewrites cross-references and annotations, then squashes branch commits into a single rebase-clean reindex commit.
user_invocable: true
---

# /dld-reindex — Resolve Decision ID Collisions

You are helping the developer untangle decision ID collisions before they rebase. Two or more developers can draft `DL-NNN` decisions in parallel; once one of them lands on the base branch (or appears in an open PR), the others must rename their local copies to the next free ID. This skill handles that mechanically and produces a branch state that rebases cleanly.

**This skill rewrites branch history.** That's not optional: if a colliding path (e.g. `decisions/records/DL-205.md`) was added by any commit on the branch, `git rebase` will hit an add/add conflict on that commit *before* it ever sees a later rename. The only fix is to ensure the colliding path never appears in the branch's history. The skill does this by squashing all branch commits since the merge-base into one reindex commit containing the renamed files.

If the branch has already been pushed, finishing the reindex will require a `--force-with-lease` push. The skill asks for explicit consent before rewriting history.

## Interaction style

Use the `AskUserQuestion` tool when prompting for consent and at the finish step. Everything else is deterministic.

**Do not redirect any command output to `/tmp` files.** The scripts in this skill emit only what you need to act on; piping to `/tmp/*.txt`, `tee`-ing into scratch files, or stashing stderr separately is unnecessary and creates clutter outside the repo. If a command's output is too long to read in one go, narrow it (`| tail -N`, `| head -N`, or pass a more specific flag) rather than persisting it.

## Script Paths

Shared scripts:
```
.claude/skills/dld-common/scripts/common.sh
.claude/skills/dld-common/scripts/regenerate-index.sh
```

Skill-specific scripts:
```
.claude/skills/dld-reindex/scripts/resolve-base.sh
.claude/skills/dld-reindex/scripts/plan-renames.sh
.claude/skills/dld-reindex/scripts/find-collisions.sh
.claude/skills/dld-reindex/scripts/list-taken-ids.sh
.claude/skills/dld-reindex/scripts/rename-decision.sh
.claude/skills/dld-reindex/scripts/find-stale-mentions.sh
.claude/skills/dld-reindex/scripts/commit-reindex.sh
```

## Prerequisites

1. Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.
2. Verify the working tree is clean (`git status --porcelain` empty). If not, ask the user to commit or stash first, then stop.
3. Fetch the latest base state:
   ```bash
   git fetch origin
   ```

## Step 1: Resolve the base ref

```bash
BASE=$(bash .claude/skills/dld-reindex/scripts/resolve-base.sh)
```

`resolve-base.sh` prefers the branch's upstream when it tracks a *different* branch (the typical "feature → main" setup). It falls back to `origin/main` if the upstream is unset OR if the upstream tracks the same branch name as the current branch (i.e. it's just the remote copy of this same branch, not a useful collision base).

The user may pass an explicit base when invoking the skill (e.g. `/dld-reindex origin/develop`) — honor it if present.

## Step 2: Plan the renames

```bash
bash .claude/skills/dld-reindex/scripts/plan-renames.sh --base "$BASE"
```

Output is tab-separated, one rename per line:

```
<relative-path>\t<DL-OLD>\t<DL-NEW>
```

If the output is empty, exit with:

> No ID collisions detected. Safe to rebase onto `$BASE`.

`plan-renames.sh` may print a stderr note like `[dld-reindex] open PRs not scanned: gh CLI not installed`. **Always surface this to the user** so they know the renamed IDs were chosen against base-branch state only and may still collide with an open PR.

The underlying helpers (`find-collisions.sh`, `list-taken-ids.sh`) remain available for debugging, but the SKILL flow always goes through `plan-renames.sh`.

## Step 3: Get explicit consent for the history rewrite

Show the user the rename plan and the implication. Use `AskUserQuestion`:

> Resolving these collisions requires rewriting branch history. I will squash the N commits since `<merge-base>` into a single reindex commit. The original commit subjects will be preserved in the new commit body. If the branch has already been pushed, finishing will require `git push --force-with-lease`. How should I proceed?

Options:
- **Rewrite and force-push** — agent applies renames, squashes, commits, and runs `git push --force-with-lease`.
- **Rewrite only** — agent applies renames, squashes, and commits. User pushes when ready.
- **Cancel** — abort with no changes.

If the user cancels, exit without touching anything.

## Step 4: Apply renames

For each line in the plan, call:

```bash
bash .claude/skills/dld-reindex/scripts/rename-decision.sh --old DL-OLD --new DL-NEW --path <relative-path> --base "$BASE"
```

`rename-decision.sh` does all of:

- `git mv` the file from `DL-OLD.md` to `DL-NEW.md`.
- Patches the `id:` frontmatter field in the renamed file.
- Rewrites `DL-OLD` mentions inside the renamed file's body.
- Rewrites `DL-OLD` mentions inside OTHER locally-added/modified decision files (frontmatter `supersedes` / `amends` / `references` and body). Scoped to the local change set vs the base ref.
- Rewrites `` `@decision` ``(DL-OLD) annotations to `` `@decision` ``(DL-NEW) in non-decision files that are part of the local change set.

The substitution is digit-aware: renaming `DL-100` will not accidentally rewrite `DL-1000`.

**Note on plain-text DL-NNN mentions in code:** In non-decision files (source code, READMEs, etc.) `rename-decision.sh`'s rewrite is **scoped to `` `@decision` ``(DL-NNN) annotations only**. Bare `DL-NNN` references in comments, log strings, or test fixtures are left untouched here to avoid false-positive matches against unrelated identifiers. Step 5 handles them.

## Step 5: Review plain-text DL-OLD mentions

After all renames are applied (but before the squash), find any remaining bare `DL-OLD` references in non-decision changed files:

```bash
echo "$PLAN" | bash .claude/skills/dld-reindex/scripts/find-stale-mentions.sh --base "$BASE"
```

Output is tab-separated, one match per line: `<path>\t<line>\t<DL-OLD>\t<DL-NEW>\t<line-content>`. Empty output means nothing to review.

For each match:

1. Read the surrounding context in the file.
2. Decide whether the reference makes sense as `DL-OLD` or should become `DL-NEW`. A code comment like `// Span-driven batching (DL-207) groups resolutions sharing the same turn context (DL-202)` after a `DL-207 → DL-213` rename almost certainly wants `DL-213` (it's prose alongside an annotation). A test fixture string that's checking historical data may need to stay as `DL-OLD`.
3. If the line should change, use the `Edit` tool to update that specific occurrence — don't do a blanket find-and-replace.
4. If the line should stay, leave it.

Surface the list of matches to the user with your verdicts before you finish, so they can sanity-check the judgment calls.

## Step 6: Squash and commit

Pipe the rename plan into `commit-reindex.sh`:

```bash
echo "$PLAN" | bash .claude/skills/dld-reindex/scripts/commit-reindex.sh --base "$BASE"
```

This:

1. Computes the merge-base with `$BASE`.
2. Mixed-resets HEAD to the merge-base (working tree is preserved — it already holds the post-rename state from step 4).
3. Restores `INDEX.md` in the working tree to its merge-base state so the working tree is consistent with what we're about to commit. **INDEX.md is intentionally excluded from the reindex commit** — including it would cause a content conflict during rebase whenever the base branch also modified INDEX.md (git's 3-way merge fails to align both sides' top-of-file inserts even when row content overlaps). INDEX.md gets regenerated post-rebase instead.
4. Stages **only** an explicit path list derived from the original branch diff and the rename plan — the old paths (for deletions), the new paths (for additions), every other file the branch touched. Untracked unrelated paths (e.g. `.claude/worktrees`, scratch files, in-progress edits to unrelated files) are deliberately NOT swept in.
5. Commits with a templated message that lists the renames in the subject and preserves the original branch commits' subjects in the body.

**Do not use `git add -A` or `git commit -a` anywhere in this flow.** Use only `commit-reindex.sh` to commit. Targeting paths explicitly is the whole point of this step.

## Step 7: Push (if the user chose force-push)

If step 3's answer was "Rewrite and force-push":

```bash
if git rev-parse --verify --quiet "@{upstream}" >/dev/null; then
  git push --force-with-lease
else
  git push -u origin HEAD
fi
```

`--force-with-lease` is mandatory over `--force` here — it refuses to push if the remote moved since the last fetch, which protects against overwriting concurrent collaborator pushes.

## Step 8: Report

Print:

- The renames table.
- The stderr note from step 2 if `gh` was skipped.
- The number of commits squashed.
- The next steps:

> 1. `git rebase $BASE`
> 2. `bash .claude/skills/dld-common/scripts/regenerate-index.sh` (to repopulate INDEX.md with the renamed locals — the reindex commit intentionally leaves INDEX.md alone to keep the rebase conflict-free; INDEX.md is missing the renamed rows until you regenerate)
> 3. Commit the INDEX.md update

The skill never rebases or merges — that is always the user's call.

## Out of scope

- **Already-conflicted rebases.** If the user is mid-rebase with conflicts, tell them to `git rebase --abort` first and re-run this skill.
- **Preserving per-commit granularity.** The squash trades original commit boundaries for a deterministic rewrite. A future `--preserve-history` flag could perform a cherry-pick walk that rewrites each commit individually, but the edge cases (commits modifying an already-renamed file, merge commits, partial reruns) make it materially more complex than the squash.
- **Cross-namespace ID reconciliation** in namespaced projects. IDs are assumed globally unique across namespaces, matching `next-id.sh`.
