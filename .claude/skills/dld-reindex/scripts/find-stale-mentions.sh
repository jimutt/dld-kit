#!/usr/bin/env bash
# Find plain-text DL-OLD mentions in locally-changed non-decision files that
# rename-decision.sh did NOT rewrite. rename-decision.sh only touches
# `@decision(DL-OLD)` annotations in code, deliberately leaving bare `DL-NNN`
# mentions alone — substituting them blindly risks false-positive matches
# against unrelated identifiers. This script surfaces the bare mentions so the
# agent can review each one in context and decide whether it should be updated.
#
# Reads the rename plan from stdin (same tab-separated format plan-renames.sh
# emits):
#   <old-path>\t<DL-OLD>\t<DL-NEW>
#
# Output (stdout): one mention per line, tab-separated:
#   <relative-path>\t<line>\t<DL-OLD>\t<DL-NEW>\t<line-content>
# Empty output means there's nothing to review. Run this AFTER all renames have
# been applied — the script greps the post-rename working tree, so any
# `@decision(DL-OLD)` annotations that rename-decision.sh already rewrote to
# `@decision(DL-NEW)` will not appear in results.
#
# Usage: bash find-stale-mentions.sh --base <ref>

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

PLAN=$(cat)
if [[ -z "$PLAN" ]]; then
  exit 0
fi

DECISIONS_DIR_REL="$(config_get decisions_dir)"

# Locally-changed files (working-tree state included — matches rename-decision.sh).
CHANGED_FILES=$(git diff --find-renames --name-only --diff-filter=AMR "$BASE" 2>/dev/null || true)

if [[ -z "$CHANGED_FILES" ]]; then
  exit 0
fi

while IFS=$'\t' read -r _path old_id new_id; do
  [[ -z "$old_id" ]] && continue

  while IFS= read -r f; do
    [[ -z "$f" || ! -f "$f" ]] && continue
    # Decision files are handled inside rename-decision.sh's substitution pass.
    [[ "$f" == "$DECISIONS_DIR_REL"/* ]] && continue

    # Digit-aware: only match DL-OLD when not followed by another digit, so
    # renaming DL-200 does not surface bogus matches inside DL-2000.
    # `|| true` keeps a no-match grep from aborting the script under set -e/pipefail.
    matches=$(grep -nE "${old_id}([^0-9]|\$)" "$f" 2>/dev/null || true)
    [[ -z "$matches" ]] && continue
    while IFS=: read -r lineno rest; do
      [[ -z "$lineno" ]] && continue
      printf '%s\t%s\t%s\t%s\t%s\n' "$f" "$lineno" "$old_id" "$new_id" "$rest"
    done <<< "$matches"
  done <<< "$CHANGED_FILES"
done <<< "$PLAN"
