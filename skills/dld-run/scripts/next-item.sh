#!/usr/bin/env bash
# Print the index of the next work item to run.
#
# @decision(DL-002)
#
# Usage: next-item.sh <slug>
#
# Returns the lowest-index item that still needs work — status pending,
# implementing, or verifying. In-flight items win because a resumed run must
# finish what it started before picking up new work.
#
# Prints nothing and exits 0 when every item is accepted or skipped.
# Exits 2 when an item is blocked or failed: the run needs an operator
# decision, and selecting past a blocker would silently skip it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

require_jq

SLUG="${1:?Usage: next-item.sh <slug>}"
validate_slug "$SLUG"

RUN_DIR="$(get_run_dir "$SLUG")"
STATE_FILE="$RUN_DIR/state.json"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "Error: run '$SLUG' not found at $RUN_DIR." >&2
  exit 1
fi

BLOCKED="$(jq -r '[.items[] | select(.status == "blocked" or .status == "failed") | .index] | join(", ")' "$STATE_FILE")"

if [[ -n "$BLOCKED" ]]; then
  echo "Error: run '$SLUG' has blocked items ($BLOCKED). Resolve or skip them before continuing." >&2
  exit 2
fi

jq -r 'first(.items[]
        | select(.status == "implementing" or .status == "verifying" or .status == "pending")
        | .index) // empty' "$STATE_FILE"
