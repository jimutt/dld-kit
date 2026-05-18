#!/usr/bin/env bash
# Squash the branch's commits since the merge-base with $BASE into a single
# reindex commit. Required because if the original branch added decision files
# at colliding paths (e.g. DL-205.md), those paths exist in the branch's HISTORY
# even after a later rename — and `git rebase` will hit an add/add conflict on
# the original add commit. Rewriting history so the colliding paths never
# appear in any branch commit is the only reliable fix.
#
# Stages an EXPLICIT path list derived from the original branch diff (mapped
# through the rename plan). Untracked unrelated paths (.claude/worktrees,
# scratch dirs, in-progress unrelated edits) are never swept in — `git add -A`
# with no pathspec is deliberately avoided.
#
# INDEX.md is INTENTIONALLY excluded from the commit and restored in the
# working tree to its merge-base state. Including it would cause a content
# conflict during rebase whenever the base branch also modified INDEX.md, since
# both sides insert rows at the top of the same file (git's 3-way merge fails
# to align them even when row content overlaps). The post-rebase step in the
# SKILL is to regenerate INDEX.md once, which is conflict-free.
#
# Reads the rename plan from stdin, one rename per line (tab-separated):
#   <old-path>\t<DL-OLD>\t<DL-NEW>
#
# Usage: bash commit-reindex.sh --base <ref>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

BASE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$BASE" ]]; then
  echo "Error: --base is required." >&2
  exit 1
fi

PROJECT_ROOT="$(get_project_root)"
cd "$PROJECT_ROOT"

if ! git rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
  echo "Error: base ref '$BASE' not found." >&2
  exit 1
fi

PLAN=$(cat)
if [[ -z "$PLAN" ]]; then
  echo "Error: no rename plan on stdin." >&2
  exit 1
fi

MERGE_BASE=$(git merge-base "$BASE" HEAD)

if [[ "$MERGE_BASE" == "$(git rev-parse HEAD)" ]]; then
  echo "Error: HEAD is already at the merge-base — nothing to squash." >&2
  exit 1
fi

# Files touched by branch commits since merge-base (pre-rename perspective).
BRANCH_FILES=$(git diff --name-only --diff-filter=AMRD "$MERGE_BASE"..HEAD)

# Build the explicit stage set. We collect every relevant path so we can
# `git add -A --` each one (which handles add/modify/delete uniformly).
DECISIONS_DIR_REL="$(config_get decisions_dir)"
PATHS=()

# Renamed files: stage BOTH old and new paths so that deletions of the old
# (if it ever existed in merge-base) and additions of the new are captured.
while IFS=$'\t' read -r old_path old_id new_id; do
  [[ -z "$old_path" ]] && continue
  new_path="$(dirname "$old_path")/$new_id.md"
  PATHS+=("$old_path" "$new_path")
done <<< "$PLAN"

INDEX_PATH="$DECISIONS_DIR_REL/INDEX.md"

# Other branch-touched files (annotation rewrites land here).
# INDEX.md is deliberately excluded — see the header comment.
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  [[ "$f" == "$INDEX_PATH" ]] && continue
  PATHS+=("$f")
done <<< "$BRANCH_FILES"

# Capture original commit subjects (for the new commit body) BEFORE we move HEAD.
ORIGINAL_COMMITS=$(git log --reverse --format='- %s' "$MERGE_BASE"..HEAD)

# Build the rename summary for the subject line.
RENAME_COUNT=0
RENAMES=""
RENAME_LIST=""
while IFS=$'\t' read -r _ old_id new_id; do
  [[ -z "$old_id" ]] && continue
  RENAME_COUNT=$((RENAME_COUNT + 1))
  if [[ -n "$RENAMES" ]]; then
    RENAMES+=", "
  fi
  RENAMES+="${old_id} -> ${new_id}"
  RENAME_LIST+="- ${old_id} -> ${new_id}"$'\n'
done <<< "$PLAN"

if [[ "$RENAME_COUNT" -gt 3 ]]; then
  SUBJECT="reindex $RENAME_COUNT local decisions to avoid base-branch collisions"
else
  SUBJECT="reindex local decisions: $RENAMES"
fi

# Mixed reset to merge-base — moves HEAD, clears the index, leaves the working tree alone.
git reset --quiet "$MERGE_BASE"

# Restore INDEX.md in the working tree to match merge-base state (or remove
# it entirely if merge-base didn't have it). This keeps the working tree
# consistent with what we're about to commit (which excludes INDEX.md).
if git cat-file -e "HEAD:$INDEX_PATH" 2>/dev/null; then
  git checkout HEAD -- "$INDEX_PATH"
elif [[ -f "$INDEX_PATH" ]]; then
  rm -f "$INDEX_PATH"
fi

# Dedup the path list and stage each explicitly.
printf '%s\n' "${PATHS[@]}" | sort -u | while IFS= read -r p; do
  [[ -z "$p" ]] && continue
  # `git add -A --` on a single pathspec stages add/modify/delete for THAT path only.
  # If the path doesn't exist on disk and isn't in the index, git is a no-op + non-zero;
  # swallow that case rather than abort.
  git add -A -- "$p" 2>/dev/null || true
done

if git diff --cached --quiet; then
  echo "Error: nothing to commit after squash. The reindex may have already been applied, or the plan didn't match the branch state." >&2
  exit 1
fi

# Build the full message.
if [[ -n "$ORIGINAL_COMMITS" ]]; then
  FULL_MSG="$SUBJECT

Renames:
${RENAME_LIST%
}

Squashed from original branch commits:
$ORIGINAL_COMMITS"
else
  FULL_MSG="$SUBJECT

Renames:
${RENAME_LIST%
}"
fi

git commit --quiet -m "$FULL_MSG"
NEW_HEAD=$(git rev-parse --short HEAD)
echo "Created reindex commit $NEW_HEAD on top of $(git rev-parse --short "$MERGE_BASE")"
