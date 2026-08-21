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
# Statuses: active, paused, blocked, complete, stopped

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

require_jq

VALID_STATUSES=(active paused blocked complete stopped)

usage() {
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
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
