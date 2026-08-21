#!/usr/bin/env bash
# Block a work item and raise an operator question in the run.
#
# @decision(DL-004)
#
# Usage: block-item.sh <slug> <index> --reason <text> [--question <text>] [--force]
#
# Escalation is recorded in the run, never in the decision log: an entry in
# blockedQuestions plus an event. A blocker is operational, not a design
# choice, so it must not become a decision record.
#
# Refuses to block an item that has not used its retry yet (attempts < 2),
# because the policy is one retry with the failure as context before stopping
# for a human. --force overrides, for failures that retrying cannot fix.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

require_jq

SLUG="${1:?Usage: block-item.sh <slug> <index> --reason <text> [--question <text>]}"
INDEX="${2:?Usage: block-item.sh <slug> <index> --reason <text> [--question <text>]}"
shift 2

REASON=""
QUESTION=""
FORCE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reason) REASON="$2"; shift 2 ;;
    --question) QUESTION="$2"; shift 2 ;;
    --force) FORCE=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$REASON" ]]; then
  echo "Error: --reason is required." >&2
  exit 1
fi

validate_slug "$SLUG"
STATE_FILE="$(get_run_dir "$SLUG")/state.json"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "Error: run '$SLUG' not found." >&2
  exit 1
fi

if ! jq -e --argjson i "$INDEX" 'any(.items[]; .index == $i)' "$STATE_FILE" >/dev/null; then
  echo "Error: item $INDEX not found in run '$SLUG'." >&2
  exit 1
fi

ATTEMPTS="$(jq -r --argjson i "$INDEX" '.items[] | select(.index == $i) | .attempts' "$STATE_FILE")"

if [[ "$FORCE" != true && "$ATTEMPTS" -lt 2 ]]; then
  echo "Error: item $INDEX has $ATTEMPTS attempt(s). Retry once with the failure as context before blocking, or pass --force." >&2
  exit 1
fi

[[ -z "$QUESTION" ]] && QUESTION="How should this be resolved? Answer to retry, or skip the item."

bash "$SCRIPT_DIR/run-state.sh" set-item-status "$SLUG" "$INDEX" blocked
bash "$SCRIPT_DIR/run-state.sh" set-status "$SLUG" blocked

QUESTION_JSON="$(jq -n \
  --argjson item "$INDEX" \
  --arg reason "$REASON" \
  --arg question "$QUESTION" \
  --arg raisedAt "$(utc_timestamp)" \
  --argjson attempts "$ATTEMPTS" \
  '{item: $item, reason: $reason, question: $question, raisedAt: $raisedAt,
    attempts: $attempts, answer: null, answeredAt: null, resolution: null}')"

EXISTING="$(jq -c '.blockedQuestions' "$STATE_FILE")"
UPDATED="$(jq --argjson q "$QUESTION_JSON" '. + [$q]' <<<"$EXISTING")"
bash "$SCRIPT_DIR/run-state.sh" set "$SLUG" .blockedQuestions "$UPDATED"

bash "$SCRIPT_DIR/append-event.sh" "$SLUG" item-blocked \
  --data "$(jq -n --argjson item "$INDEX" --arg reason "$REASON" '{item: $item, reason: $reason}')"

echo "Item $INDEX blocked. Run paused for an operator answer."
