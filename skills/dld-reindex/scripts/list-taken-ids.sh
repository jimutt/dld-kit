#!/usr/bin/env bash
# Output the set of decision IDs taken on the base branch and (best-effort) open PRs.
# One DL-NNN per line, sorted unique.
# Usage: list-taken-ids.sh [--base <ref>] [--exclude-contained]
#
# --exclude-contained drops PRs whose head branch is already an ancestor of
# HEAD. Those IDs are still *taken* — they are in this branch's tree — so the
# flag is off by default and the plain output stays a faithful answer to "which
# IDs are claimed anywhere", which is what ID allocation needs. Callers asking
# the narrower question "which claims conflict with mine" opt in.
# Default base: origin/main
# Emits a stderr note when the open-PR scan is skipped (gh missing, repo not on GitHub,
# or gh not authenticated). Exits 0 in all those cases — the base-branch scan is the
# minimum guarantee.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

BASE="origin/main"
EXCLUDE_CONTAINED=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --exclude-contained) EXCLUDE_CONTAINED=true; shift ;;
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

  # IDs in files touched by open PRs targeting this base. Scope to paths under
  # the records dir so an unrelated PR touching e.g. notes/DL-007-meeting.md
  # doesn't poison the taken set.
  #
  # @decision(DL-025)
  # A PR whose head is this branch holds this branch's own decisions, so it is
  # never a competing claim.
  #
  # With --exclude-contained, a PR this branch is stacked on is dropped too:
  # its head is an ancestor of HEAD, so its decisions are already in this
  # branch's tree. That is the normal DLD workflow — decisions land as one PR,
  # implementation branches are cut from it — and without the filter every
  # decision such a branch exists to implement reads as a collision. It is
  # opt-in because those IDs remain taken for allocation purposes.
  #
  # When the head ref is absent locally, ancestry can't be established and the
  # PR stays in the set: an unfetched branch is treated as foreign, so a
  # missing fetch can't silently drop a real claim.
  if [[ -z "$SKIP_REASON" ]]; then
    CURRENT_BRANCH="$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || true)"
    while IFS=$'\t' read -r head path; do
      [[ -z "$head" || -z "$path" ]] && continue
      [[ "$head" == "$CURRENT_BRANCH" ]] && continue
      if [[ "$EXCLUDE_CONTAINED" == true ]] \
        && git -C "$PROJECT_ROOT" merge-base --is-ancestor "origin/$head" HEAD 2>/dev/null; then
        continue
      fi
      printf '%s\n' "$path"
    done < <(
      gh pr list --state open --base "$PR_BASE" --json files,headRefName --limit 100 \
        --jq '.[] | .headRefName as $h | .files[].path | [$h, .] | @tsv' 2>/dev/null || true
    ) \
      | grep -E "^${RECORDS_DIR_REL}/" \
      | grep -oE 'DL-[0-9]+' || true
  fi
} | sort -u

if [[ -n "$SKIP_REASON" ]]; then
  echo "[dld-reindex] open PRs not scanned: $SKIP_REASON" >&2
fi
