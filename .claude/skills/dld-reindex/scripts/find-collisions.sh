#!/usr/bin/env bash
# Detect locally-added decision files whose IDs collide with the base branch or open PRs.
# Output: one line per collision: <relative-path>\t<DL-NNN>
# Exits 0 with no output if there are no collisions.
# Usage: find-collisions.sh [--base <ref>]

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

if ! git -C "$PROJECT_ROOT" rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
  echo "Error: base ref '$BASE' not found." >&2
  exit 1
fi

# @decision(DL-025)
# Collision detection asks the narrow question: which claims conflict with
# mine? Decisions already in this branch's history are mine, however they got
# here — including via a PR this branch is stacked on. They stay taken for ID
# allocation, which is why the filter is requested here rather than baked into
# list-taken-ids.sh.
TAKEN=$(bash "$SCRIPT_DIR/list-taken-ids.sh" --base "$BASE" --exclude-contained)

LOCAL_ADDED=$(git -C "$PROJECT_ROOT" diff --name-only --diff-filter=A "$BASE"...HEAD -- "$RECORDS_DIR_REL" 2>/dev/null || true)

if [[ -z "$LOCAL_ADDED" ]]; then
  exit 0
fi

while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  id=$(basename "$path" .md)
  if [[ ! "$id" =~ ^DL-[0-9]+$ ]]; then
    continue
  fi
  if grep -qxF "$id" <<<"$TAKEN"; then
    printf "%s\t%s\n" "$path" "$id"
  fi
done <<< "$LOCAL_ADDED"
