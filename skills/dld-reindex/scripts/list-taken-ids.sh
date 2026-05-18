#!/usr/bin/env bash
# Output the set of decision IDs taken on the base branch and (best-effort) open PRs.
# One DL-NNN per line, sorted unique.
# Usage: list-taken-ids.sh [--base <ref>]
# Default base: origin/main
# Emits a stderr note when the open-PR scan is skipped (gh missing, repo not on GitHub,
# or gh not authenticated). Exits 0 in all those cases — the base-branch scan is the
# minimum guarantee.

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
DECISIONS_DIR_REL="$(config_get decisions_dir)"
RECORDS_DIR_REL="$DECISIONS_DIR_REL/records"

if ! git -C "$PROJECT_ROOT" rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
  echo "Error: base ref '$BASE' not found. Fetch first or pass --base." >&2
  exit 1
fi

# Determine whether to scan open PRs via gh.
SKIP_REASON=""
if ! command -v gh >/dev/null 2>&1; then
  SKIP_REASON="gh CLI not installed"
elif ! git -C "$PROJECT_ROOT" remote get-url origin 2>/dev/null | grep -qE 'github\.com[:/]'; then
  SKIP_REASON="origin is not a GitHub remote"
elif ! gh auth status >/dev/null 2>&1; then
  SKIP_REASON="gh not authenticated"
fi

PR_BASE="${BASE#origin/}"

{
  # IDs already on the base branch
  git -C "$PROJECT_ROOT" ls-tree -r --name-only "$BASE" -- "$RECORDS_DIR_REL" 2>/dev/null \
    | grep -oE 'DL-[0-9]+' || true

  # IDs in files touched by open PRs targeting this base
  if [[ -z "$SKIP_REASON" ]]; then
    gh pr list --state open --base "$PR_BASE" --json files --limit 100 \
      --jq '.[].files[].path' 2>/dev/null \
      | grep -oE 'DL-[0-9]+' || true
  fi
} | sort -u

if [[ -n "$SKIP_REASON" ]]; then
  echo "[dld-reindex] open PRs not scanned: $SKIP_REASON" >&2
fi
