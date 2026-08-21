#!/usr/bin/env bash
# Read and mutate goal run state. All writes are atomic (temp file + rename)
# and refresh updatedAt.
#
# @decision(DL-001)
#
# Usage:
#   run-state.sh get <slug> [jq-path]        Print state, or one field
#   run-state.sh set <slug> <jq-path> <json> Set a field to a JSON value
#   run-state.sh set-status <slug> <status>  Set run status (validated)
#   run-state.sh list                        List runs as "<slug> <status>"
#   run-state.sh active                      Print the active run's slug, if any
#
#   run-state.sh add-item <slug> --decisions <DL-A,DL-B> [--check <cmd>]...
#                                [--annotation <path>]...
#                                Checks are stored as argv and run without a
#                                shell; shell operators are rejected.
#   run-state.sh get-item <slug> <index>     Print one item as JSON
#   run-state.sh set-item-status <slug> <index> <status>
#   run-state.sh add-evidence <slug> <index> <json>
#   run-state.sh bump-attempt <slug> <index> Increment and print attempt count
#   run-state.sh repin-item <slug> <index>   Recompute the item's decision hashes
#
# Run statuses:  active, paused, blocked, complete, stopped
# Item statuses: pending, implementing, verifying, accepted, blocked, skipped, failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

require_jq

VALID_STATUSES=(active paused blocked complete stopped)
VALID_ITEM_STATUSES=(pending implementing verifying accepted blocked skipped failed)
# Statuses that mean the item is being worked right now.
IN_FLIGHT_STATUSES=(implementing verifying)

usage() {
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 1
}

state_file() {
  local slug="$1"
  validate_slug "$slug"
  local run_dir
  run_dir="$(get_run_dir "$slug")"
  if [[ ! -f "$run_dir/state.json" ]]; then
    echo "Error: run '$slug' not found at $run_dir." >&2
    exit 1
  fi
  echo "$run_dir/state.json"
}

# Reject anything that is not a plain jq field/index path.
# Allows letters, digits, underscore, dot, brackets, quotes and hyphen — enough
# for .a.b, .items[0], .a["b"] — and nothing that could smuggle in a filter.
validate_path() {
  local path="$1"
  local stripped
  stripped="$(printf '%s' "$path" | tr -d 'A-Za-z0-9_.[]"-')"
  if [[ "${path:0:1}" != "." || -n "$stripped" ]]; then
    echo "Error: unsupported jq path '$path'." >&2
    exit 1
  fi
}

# Split a check command into argv, rejecting anything that needs a shell.
# Checks are executed directly, never through a shell, so stored contract
# content cannot be interpreted as shell syntax. @decision(DL-003)
parse_check() {
  local raw="$1"
  local stripped
  stripped="$(printf '%s' "$raw" | tr -d 'A-Za-z0-9 _./:=+@,-')"
  if [[ -n "$stripped" ]]; then
    echo "Error: shell operators and quoting are not allowed in a check: '$raw'" >&2
    echo "Checks run without a shell. Put compound commands in a repo script, e.g." >&2
    echo "  --check \"./scripts/check.sh billing\"" >&2
    exit 1
  fi
  local parts=()
  set -f
  IFS=' ' read -ra parts <<< "$raw"
  set +f
  if [[ ${#parts[@]} -eq 0 ]]; then
    echo "Error: empty check." >&2
    exit 1
  fi
  # Append one at a time: jq --args treats a literal "--" as end-of-options,
  # which would silently drop it from commands like "npm test -- src/x".
  local json="[]"
  local part
  for part in "${parts[@]}"; do
    json="$(jq -c --arg p "$part" '. + [$p]' <<<"$json")"
  done
  printf '%s' "$json"
}

# Fail unless the item index exists in the run.
require_item() {
  local file="$1"
  local index="$2"
  if [[ ! "$index" =~ ^[0-9]+$ ]]; then
    echo "Error: item index must be a positive integer, got '$index'." >&2
    exit 1
  fi
  if ! jq -e --argjson i "$index" 'any(.items[]; .index == $i)' "$file" >/dev/null; then
    echo "Error: item $index not found in run." >&2
    exit 1
  fi
}

# Apply a jq filter atomically, always refreshing updatedAt.
# Usage: apply <file> <filter> [jq-args...]
apply() {
  local file="$1"
  local filter="$2"
  shift 2
  local tmp
  tmp="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN
  if ! jq "$@" --arg __now "$(utc_timestamp)" "$filter | . + {updatedAt: \$__now}" "$file" > "$tmp"; then
    echo "Error: failed to update state." >&2
    exit 1
  fi
  mv "$tmp" "$file"
}

COMMAND="${1:-}"
[[ -z "$COMMAND" ]] && usage
shift || true

case "$COMMAND" in
  get)
    SLUG="${1:?Usage: run-state.sh get <slug> [jq-path]}"
    FILE="$(state_file "$SLUG")"
    if [[ $# -ge 2 ]]; then
      validate_path "$2"
      jq -r "$2" "$FILE"
    else
      cat "$FILE"
    fi
    ;;

  set)
    SLUG="${1:?Usage: run-state.sh set <slug> <jq-path> <json>}"
    PATH_EXPR="${2:?Usage: run-state.sh set <slug> <jq-path> <json>}"
    VALUE="${3:?Usage: run-state.sh set <slug> <jq-path> <json>}"
    FILE="$(state_file "$SLUG")"
    validate_path "$PATH_EXPR"
    if ! echo "$VALUE" | jq -e . >/dev/null 2>&1; then
      echo "Error: value must be valid JSON, got '$VALUE'." >&2
      exit 1
    fi
    apply "$FILE" "$PATH_EXPR = \$__v" --argjson __v "$VALUE"
    ;;

  set-status)
    SLUG="${1:?Usage: run-state.sh set-status <slug> <status>}"
    STATUS="${2:?Usage: run-state.sh set-status <slug> <status>}"
    FILE="$(state_file "$SLUG")"
    valid=false
    for s in "${VALID_STATUSES[@]}"; do
      [[ "$STATUS" == "$s" ]] && valid=true
    done
    if [[ "$valid" != true ]]; then
      echo "Error: invalid run status '$STATUS'. Valid: ${VALID_STATUSES[*]}" >&2
      exit 1
    fi
    apply "$FILE" '.status = $__s' --arg __s "$STATUS"
    ;;

  add-item)
    SLUG="${1:?Usage: run-state.sh add-item <slug> --decisions <DL-A,DL-B> ...}"
    shift
    FILE="$(state_file "$SLUG")"
    DECISIONS=""
    CHECKS="[]"
    ANNOTATIONS="[]"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --decisions) DECISIONS="$2"; shift 2 ;;
        --check) CHECKS="$(jq --argjson c "$(parse_check "$2")" '. + [$c]' <<<"$CHECKS")"; shift 2 ;;
        --annotation) ANNOTATIONS="$(jq --arg a "$2" '. + [$a]' <<<"$ANNOTATIONS")"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
      esac
    done
    if [[ -z "$DECISIONS" ]]; then
      echo "Error: --decisions is required." >&2
      exit 1
    fi

    # Pin each decision by its intent hash at planning time.
    DECISIONS_JSON="[]"
    IFS=',' read -ra __ids <<< "$DECISIONS"
    for raw_id in "${__ids[@]}"; do
      id="$(printf '%s' "$raw_id" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      [[ -z "$id" ]] && continue
      hash="$(bash "$SCRIPT_DIR/decision-hash.sh" "$id")"
      DECISIONS_JSON="$(jq --arg id "$id" --arg h "$hash" '. + [{id: $id, hash: $h}]' <<<"$DECISIONS_JSON")"
    done
    if [[ "$(jq 'length' <<<"$DECISIONS_JSON")" -eq 0 ]]; then
      echo "Error: no decisions parsed from '$DECISIONS'." >&2
      exit 1
    fi

    ITEM="$(jq -n \
      --argjson decisions "$DECISIONS_JSON" \
      --argjson checks "$CHECKS" \
      --argjson annotations "$ANNOTATIONS" \
      '{index: 0, decisions: $decisions, status: "pending",
        acceptance: {annotations: $annotations, checks: $checks},
        attempts: 0, evidence: []}')"

    # Append, then renumber so index always matches position.
    apply "$FILE" \
      '.items = ((.items + [$__item]) | [to_entries[] | .value + {index: (.key + 1)}])' \
      --argjson __item "$ITEM"

    jq -r '.items | length' "$FILE"
    ;;

  get-item)
    SLUG="${1:?Usage: run-state.sh get-item <slug> <index>}"
    INDEX="${2:?Usage: run-state.sh get-item <slug> <index>}"
    FILE="$(state_file "$SLUG")"
    require_item "$FILE" "$INDEX"
    jq --argjson i "$INDEX" '.items[] | select(.index == $i)' "$FILE"
    ;;

  set-item-status)
    SLUG="${1:?Usage: run-state.sh set-item-status <slug> <index> <status>}"
    INDEX="${2:?Usage: run-state.sh set-item-status <slug> <index> <status>}"
    STATUS="${3:?Usage: run-state.sh set-item-status <slug> <index> <status>}"
    FILE="$(state_file "$SLUG")"
    require_item "$FILE" "$INDEX"
    valid=false
    for s in "${VALID_ITEM_STATUSES[@]}"; do
      [[ "$STATUS" == "$s" ]] && valid=true
    done
    if [[ "$valid" != true ]]; then
      echo "Error: invalid item status '$STATUS'. Valid: ${VALID_ITEM_STATUSES[*]}" >&2
      exit 1
    fi

    # currentItem tracks the item being worked, and clears when it stops.
    in_flight=false
    for s in "${IN_FLIGHT_STATUSES[@]}"; do
      [[ "$STATUS" == "$s" ]] && in_flight=true
    done

    apply "$FILE" \
      '.items |= map(if .index == $__i then .status = $__s else . end)
       | .currentItem = (if $__flight then $__i else (if .currentItem == $__i then null else .currentItem end) end)' \
      --argjson __i "$INDEX" --arg __s "$STATUS" --argjson __flight "$in_flight"
    ;;

  add-evidence)
    SLUG="${1:?Usage: run-state.sh add-evidence <slug> <index> <json>}"
    INDEX="${2:?Usage: run-state.sh add-evidence <slug> <index> <json>}"
    VALUE="${3:?Usage: run-state.sh add-evidence <slug> <index> <json>}"
    FILE="$(state_file "$SLUG")"
    require_item "$FILE" "$INDEX"
    if ! echo "$VALUE" | jq -e . >/dev/null 2>&1; then
      echo "Error: evidence must be valid JSON, got '$VALUE'." >&2
      exit 1
    fi
    apply "$FILE" \
      '.items |= map(if .index == $__i then .evidence += [$__e] else . end)' \
      --argjson __i "$INDEX" --argjson __e "$VALUE"
    ;;

  bump-attempt)
    SLUG="${1:?Usage: run-state.sh bump-attempt <slug> <index>}"
    INDEX="${2:?Usage: run-state.sh bump-attempt <slug> <index>}"
    FILE="$(state_file "$SLUG")"
    require_item "$FILE" "$INDEX"
    apply "$FILE" \
      '.items |= map(if .index == $__i then .attempts += 1 else . end)' \
      --argjson __i "$INDEX"
    jq -r --argjson i "$INDEX" '.items[] | select(.index == $i) | .attempts' "$FILE"
    ;;

  repin-item)
    SLUG="${1:?Usage: run-state.sh repin-item <slug> <index>}"
    INDEX="${2:?Usage: run-state.sh repin-item <slug> <index>}"
    FILE="$(state_file "$SLUG")"
    require_item "$FILE" "$INDEX"
    REPINNED="[]"
    while IFS= read -r id; do
      [[ -z "$id" ]] && continue
      hash="$(bash "$SCRIPT_DIR/decision-hash.sh" "$id")"
      REPINNED="$(jq --arg id "$id" --arg h "$hash" '. + [{id: $id, hash: $h}]' <<<"$REPINNED")"
    done < <(jq -r --argjson i "$INDEX" '.items[] | select(.index == $i) | .decisions[].id' "$FILE")
    apply "$FILE" \
      '.items |= map(if .index == $__i then .decisions = $__d else . end)' \
      --argjson __i "$INDEX" --argjson __d "$REPINNED"
    ;;

  list)
    RUNS_DIR="$(get_runs_dir)"
    [[ -d "$RUNS_DIR" ]] || exit 0
    for dir in "$RUNS_DIR"/*/; do
      [[ -f "$dir/state.json" ]] || continue
      jq -r '"\(.slug) \(.status)"' "$dir/state.json"
    done
    ;;

  active)
    RUNS_DIR="$(get_runs_dir)"
    [[ -d "$RUNS_DIR" ]] || exit 0
    for dir in "$RUNS_DIR"/*/; do
      [[ -f "$dir/state.json" ]] || continue
      jq -r 'select(.status == "active") | .slug' "$dir/state.json"
    done
    ;;

  *)
    echo "Unknown command: $COMMAND" >&2
    usage
    ;;
esac
