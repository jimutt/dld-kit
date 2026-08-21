#!/usr/bin/env bash
# Run the mechanical half of an item's completion transaction.
#
# @decision(DL-003)
#
# Usage: verify-item.sh <slug> <index>
#
# Step 2 of the four-part transaction: annotations must exist for every
# decision in the item, and every acceptance check must exit 0. Results are
# recorded as evidence on the item whether they pass or fail — a failed run
# leaves a record of what failed, not just that something did.
#
# Checks are stored as argv and executed directly. No shell is involved, so
# contract content cannot be interpreted as shell syntax — a check that needs
# operators or quoting belongs in a repo script.
#
# Exits 0 when everything passes, 1 when anything fails.
#
# This script does not decide what happens next. Retry, block, and accept are
# the caller's job (DL-004), and the review step is step 3.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

require_jq

SLUG="${1:?Usage: verify-item.sh <slug> <index>}"
INDEX="${2:?Usage: verify-item.sh <slug> <index>}"

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

ROOT="$(get_project_root)"
FAILED=0

record() {
  bash "$SCRIPT_DIR/run-state.sh" add-evidence "$SLUG" "$INDEX" "$1"
}

# --- annotations ---

DECISION_IDS=()
while IFS= read -r id; do
  [[ -n "$id" ]] && DECISION_IDS+=("$id")
done < <(jq -r --argjson i "$INDEX" '.items[] | select(.index == $i) | .decisions[].id' "$STATE_FILE")

if [[ ${#DECISION_IDS[@]} -eq 0 ]]; then
  echo "Error: item $INDEX has no decisions." >&2
  exit 1
fi

ANNOTATION_OUTPUT=""
if ANNOTATION_OUTPUT="$(bash "$SCRIPT_DIR/../../dld-implement/scripts/verify-annotations.sh" "${DECISION_IDS[@]}" 2>&1)"; then
  ANNOTATION_EXIT=0
else
  ANNOTATION_EXIT=1
  FAILED=1
fi

echo "$ANNOTATION_OUTPUT"

record "$(jq -n \
  --arg output "$ANNOTATION_OUTPUT" \
  --argjson exit "$ANNOTATION_EXIT" \
  --arg at "$(utc_timestamp)" \
  '{kind: "annotations", exit: $exit, output: $output, at: $at}')" >/dev/null

# --- acceptance checks ---

while IFS= read -r check_json; do
  [[ -z "$check_json" ]] && continue

  # Rebuild argv. read/append rather than mapfile: bash 3.2 on macOS.
  cmd=()
  while IFS= read -r part; do
    cmd+=("$part")
  done < <(jq -r '.[]' <<<"$check_json")

  if [[ ${#cmd[@]} -eq 0 ]]; then
    continue
  fi

  DISPLAY="$(printf '%s ' "${cmd[@]}")"
  DISPLAY="${DISPLAY% }"

  echo "running: $DISPLAY"
  set +e
  CHECK_OUTPUT="$(cd "$ROOT" && "${cmd[@]}" 2>&1)"
  CHECK_EXIT=$?
  set -e

  if [[ $CHECK_EXIT -ne 0 ]]; then
    FAILED=1
    echo "FAILED ($CHECK_EXIT): $DISPLAY"
  fi

  # Keep the tail: enough to diagnose, bounded so state.json stays readable.
  TAIL_OUTPUT="$(printf '%s' "$CHECK_OUTPUT" | tail -c 2000)"

  record "$(jq -n \
    --argjson command "$check_json" \
    --argjson exit "$CHECK_EXIT" \
    --arg output "$TAIL_OUTPUT" \
    --arg at "$(utc_timestamp)" \
    '{kind: "check", command: $command, exit: $exit, output: $output, at: $at}')" >/dev/null
done < <(jq -c --argjson i "$INDEX" '.items[] | select(.index == $i) | .acceptance.checks[]?' "$STATE_FILE")

if [[ $FAILED -eq 0 ]]; then
  bash "$SCRIPT_DIR/append-event.sh" "$SLUG" item-verified \
    --data "$(jq -n --argjson item "$INDEX" '{item: $item}')"
  echo "Item $INDEX passed mechanical verification."
else
  bash "$SCRIPT_DIR/append-event.sh" "$SLUG" item-verification-failed \
    --data "$(jq -n --argjson item "$INDEX" '{item: $item}')"
  echo "Item $INDEX failed mechanical verification."
fi

exit "$FAILED"
