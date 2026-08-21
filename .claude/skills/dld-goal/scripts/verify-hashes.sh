#!/usr/bin/env bash
# Check that pinned decision hashes still match the decision records on disk.
#
# @decision(DL-002)
#
# Usage: verify-hashes.sh <slug> [--all]
#
# Default: checks items that have not started (status pending). An item being
# worked may legitimately refine its own proposed decisions, so it is re-pinned
# on completion rather than reported as drift.
#
# --all: also checks in-flight items (implementing, verifying). Use on resume,
# when the run has been idle and any change is suspect.
#
# Prints one line per mismatch and exits 1. Silent with exit 0 when clean.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

require_jq

SLUG="${1:?Usage: verify-hashes.sh <slug> [--all]}"
shift || true

SCOPE='["pending"]'
if [[ "${1:-}" == "--all" ]]; then
  SCOPE='["pending","implementing","verifying"]'
elif [[ -n "${1:-}" ]]; then
  echo "Unknown option: $1" >&2
  exit 1
fi

validate_slug "$SLUG"

RUN_DIR="$(get_run_dir "$SLUG")"
STATE_FILE="$RUN_DIR/state.json"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "Error: run '$SLUG' not found at $RUN_DIR." >&2
  exit 1
fi

DRIFT=0

while IFS=$'\t' read -r index id pinned; do
  [[ -z "$index" ]] && continue

  if ! current="$(bash "$SCRIPT_DIR/decision-hash.sh" "$id" 2>/dev/null)"; then
    echo "item $index: $id is missing from the decision log"
    DRIFT=1
    continue
  fi

  if [[ "$current" != "$pinned" ]]; then
    echo "item $index: $id changed since it was planned"
    DRIFT=1
  fi
done < <(jq -r --argjson scope "$SCOPE" '
  .items[]
  | select(.status as $s | $scope | index($s))
  | .index as $i
  | .decisions[]
  | [$i, .id, .hash]
  | @tsv' "$STATE_FILE")

exit "$DRIFT"
