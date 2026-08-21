#!/usr/bin/env bash
# Resolve a blocked item with the operator's answer.
#
# @decision(DL-004)
#
# Usage: resolve-block.sh <slug> <index> --answer <text> --action retry|skip
#
#   retry — the answer unblocks the work; the item goes back to implementing
#   skip  — the item is abandoned; the run continues with later items and the
#           decisions stay proposed
#
# The answer is recorded against the open question so the run history shows
# why the path changed. Resolving reactivates the run.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

require_jq

SLUG="${1:?Usage: resolve-block.sh <slug> <index> --answer <text> --action retry|skip}"
INDEX="${2:?Usage: resolve-block.sh <slug> <index> --answer <text> --action retry|skip}"
shift 2

ANSWER=""
ACTION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --answer) ANSWER="$2"; shift 2 ;;
    --action) ACTION="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$ANSWER" ]]; then
  echo "Error: --answer is required." >&2
  exit 1
fi

case "$ACTION" in
  retry|skip) ;;
  *) echo "Error: --action must be 'retry' or 'skip', got '$ACTION'." >&2; exit 1 ;;
esac

validate_slug "$SLUG"
STATE_FILE="$(get_run_dir "$SLUG")/state.json"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "Error: run '$SLUG' not found." >&2
  exit 1
fi

CURRENT_STATUS="$(jq -r --argjson i "$INDEX" '.items[] | select(.index == $i) | .status' "$STATE_FILE")"

if [[ -z "$CURRENT_STATUS" ]]; then
  echo "Error: item $INDEX not found in run '$SLUG'." >&2
  exit 1
fi

if [[ "$CURRENT_STATUS" != "blocked" && "$CURRENT_STATUS" != "failed" ]]; then
  echo "Error: item $INDEX is '$CURRENT_STATUS', not blocked." >&2
  exit 1
fi

# Answer the most recent unanswered question for this item.
UPDATED="$(jq \
  --argjson item "$INDEX" \
  --arg answer "$ANSWER" \
  --arg action "$ACTION" \
  --arg answeredAt "$(utc_timestamp)" \
  '(. | map(.item == $item and .answer == null) | index(true)) as $i
   | if $i == null then .
     else .[$i] |= (.answer = $answer | .answeredAt = $answeredAt | .resolution = $action)
     end' \
  <<<"$(jq -c '.blockedQuestions' "$STATE_FILE")")"

bash "$SCRIPT_DIR/run-state.sh" set "$SLUG" .blockedQuestions "$UPDATED"

if [[ "$ACTION" == "retry" ]]; then
  bash "$SCRIPT_DIR/run-state.sh" set-item-status "$SLUG" "$INDEX" implementing
else
  bash "$SCRIPT_DIR/run-state.sh" set-item-status "$SLUG" "$INDEX" skipped
fi

bash "$SCRIPT_DIR/run-state.sh" set-status "$SLUG" active

bash "$SCRIPT_DIR/append-event.sh" "$SLUG" item-unblocked \
  --data "$(jq -n --argjson item "$INDEX" --arg action "$ACTION" --arg answer "$ANSWER" \
    '{item: $item, resolution: $action, answer: $answer}')"

echo "Item $INDEX resolved: $ACTION."
