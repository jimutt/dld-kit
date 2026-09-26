#!/usr/bin/env bash
# Plan all renames needed to resolve ID collisions in one shot.
# Combines find-collisions.sh and list-taken-ids.sh, computes the next free IDs,
# and outputs a deterministic rename plan.
#
# Output (stdout): one line per rename, tab-separated:
#   <local-path>\t<DL-OLD>\t<DL-NEW>
# Output is empty when there are no collisions.
# Stderr passes through the gh-skip notice (if any) from list-taken-ids.sh.
#
# Usage: plan-renames.sh [--base <ref>]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

BASE="origin/main"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

PROJECT_ROOT="$(get_project_root)"
RECORDS_DIR_REL="$(config_get decisions_dir)/records"

COLLISIONS=$(bash "$SCRIPT_DIR/find-collisions.sh" --base "$BASE")
if [[ -z "$COLLISIONS" ]]; then
  exit 0
fi

# Full set of IDs the renamed decisions must avoid: anything taken on the base
# branch / in open PRs, plus every locally-added ID (kept or colliding — the
# colliding ones don't matter for the max calculation but listing them keeps
# the union simple).
TAKEN=$(bash "$SCRIPT_DIR/list-taken-ids.sh" --base "$BASE")
LOCAL_ADDED=$(
  git -C "$PROJECT_ROOT" diff --name-only --diff-filter=A "$BASE"...HEAD -- "$RECORDS_DIR_REL" 2>/dev/null \
    | xargs -I{} basename {} .md \
    | grep -E '^DL-[0-9]+$' \
    || true
)

HIGHEST=$(
  {
    [[ -n "$TAKEN" ]] && echo "$TAKEN"
    [[ -n "$LOCAL_ADDED" ]] && echo "$LOCAL_ADDED"
  } \
    | grep -oE '^DL-[0-9]+$' \
    | sed 's/^DL-//' \
    | sort -n \
    | tail -1
)
HIGHEST="${HIGHEST:-0}"

# Sort colliding entries by numeric ID so the plan is deterministic.
COLLISIONS_SORTED=$(echo "$COLLISIONS" | sort -t$'\t' -k2,2)

next=$((10#$HIGHEST + 1))
while IFS=$'\t' read -r path old_id; do
  [[ -z "$path" ]] && continue
  new_id=$(printf "DL-%03d" "$next")
  printf "%s\t%s\t%s\n" "$path" "$old_id" "$new_id"
  next=$((next + 1))
done <<< "$COLLISIONS_SORTED"
