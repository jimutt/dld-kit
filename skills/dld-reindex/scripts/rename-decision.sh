#!/usr/bin/env bash
# Rename a locally-added decision from DL-OLD to DL-NEW.
#   * git mv the file (preserves rename history).
#   * Patch the file's frontmatter id field and rewrite self-references inside it.
#   * Update DL-OLD references in OTHER locally-added/modified decision files.
#   * Update @decision(DL-OLD) annotations in locally-added/modified non-decision files.
#
# Usage: rename-decision.sh --old DL-OLD --new DL-NEW --path <relative-path> [--base <ref>]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

OLD=""
NEW=""
INPUT_PATH=""
BASE="origin/main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --old) OLD="$2"; shift 2 ;;
    --new) NEW="$2"; shift 2 ;;
    --path) INPUT_PATH="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$OLD" || -z "$NEW" || -z "$INPUT_PATH" ]]; then
  echo "Error: --old, --new, and --path are required." >&2
  exit 1
fi

if [[ ! "$OLD" =~ ^DL-[0-9]+$ ]] || [[ ! "$NEW" =~ ^DL-[0-9]+$ ]]; then
  echo "Error: IDs must match DL-[0-9]+." >&2
  exit 1
fi

if [[ "$OLD" == "$NEW" ]]; then
  echo "Error: --old and --new are the same." >&2
  exit 1
fi

PROJECT_ROOT="$(get_project_root)"
cd "$PROJECT_ROOT"

if [[ ! -f "$INPUT_PATH" ]]; then
  echo "Error: $INPUT_PATH not found." >&2
  exit 1
fi

DIR=$(dirname "$INPUT_PATH")
NEW_PATH="$DIR/$NEW.md"

if [[ -e "$NEW_PATH" ]]; then
  echo "Error: $NEW_PATH already exists." >&2
  exit 1
fi

# Pick the right sed-in-place flavor. GNU and BSD both accept `-i.bak`; we then drop the backup.
sed_inplace() {
  local file="$1"; shift
  sed -E -i.bak "$@" "$file"
  rm -f "$file.bak"
}

# Substitute DL-OLD with DL-NEW only when not followed by another digit (avoids
# turning DL-100 into DL-2000 when renaming DL-100 → DL-200, etc.).
substitute_in_file() {
  local file="$1"
  sed_inplace "$file" \
    -e "s/${OLD}([^0-9])/${NEW}\\1/g" \
    -e "s/${OLD}\$/${NEW}/"
}

# 1. Rename the file via git mv.
git mv "$INPUT_PATH" "$NEW_PATH"

# 2. Patch the frontmatter id field and rewrite self-references.
sed_inplace "$NEW_PATH" -e "s/^id:[[:space:]]*${OLD}\$/id: ${NEW}/"
substitute_in_file "$NEW_PATH"

# 3. Determine the local change set: files added/modified/renamed since the
# merge-base with $BASE, INCLUDING uncommitted working-tree state. Diffing
# against the merge-base (rather than $BASE's tip) avoids conflating main's
# post-branch-point changes with feature's local work. Plain `git diff <ref>`
# (no `..HEAD`) lets the diff include working-tree changes — so when this
# script is called repeatedly during a multi-rename run, each invocation sees
# the renamed files produced by the previous calls (the new paths) instead of
# the stale committed paths (the old paths, now gone from disk). Without this,
# only the *last* rename's new-path file would have its cross-references
# updated to subsequent renames.
MERGE_BASE=$(git merge-base "$BASE" HEAD)
CHANGED_FILES=$(git diff --find-renames --name-only --diff-filter=AMR "$MERGE_BASE" 2>/dev/null || true)

DECISIONS_DIR_REL="$(config_get decisions_dir)"
ANNOTATION_PREFIX="$(config_get annotation_prefix)"

if [[ -n "$CHANGED_FILES" ]]; then
  while IFS= read -r f; do
    [[ -z "$f" || ! -f "$f" ]] && continue
    # Skip the renamed file itself (already patched in step 2).
    [[ "$f" == "$NEW_PATH" ]] && continue
    if [[ "$f" == "$DECISIONS_DIR_REL"/* ]]; then
      # Other local decision files: rewrite DL-OLD anywhere it appears.
      if grep -qE "${OLD}([^0-9]|\$)" "$f" 2>/dev/null; then
        substitute_in_file "$f"
      fi
    else
      # Non-decision files: only rewrite @decision(DL-OLD) annotations.
      if grep -qF "${ANNOTATION_PREFIX}(${OLD})" "$f" 2>/dev/null; then
        sed_inplace "$f" -e "s|${ANNOTATION_PREFIX}\\(${OLD}\\)|${ANNOTATION_PREFIX}(${NEW})|g"
      fi
    fi
  done <<< "$CHANGED_FILES"
fi

echo "$INPUT_PATH -> $NEW_PATH"
