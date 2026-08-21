#!/usr/bin/env bash
# Append an event to a run's append-only event log.
#
# @decision(DL-001)
#
# Usage: append-event.sh <slug> <type> [--data <json-object>]
#
# Writes one JSON object per line to .dld/runs/<slug>/events.jsonl. Fields from
# --data are merged into the event alongside timestamp and type.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

require_jq

SLUG="${1:-}"
TYPE="${2:-}"

if [[ -z "$SLUG" || -z "$TYPE" ]]; then
  echo "Usage: append-event.sh <slug> <type> [--data <json-object>]" >&2
  exit 1
fi

shift 2

DATA="{}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --data) DATA="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

validate_slug "$SLUG"

RUN_DIR="$(get_run_dir "$SLUG")"
EVENTS_FILE="$RUN_DIR/events.jsonl"

if [[ ! -d "$RUN_DIR" ]]; then
  echo "Error: run '$SLUG' not found at $RUN_DIR." >&2
  exit 1
fi

if ! echo "$DATA" | jq -e 'type == "object"' >/dev/null 2>&1; then
  echo "Error: --data must be a JSON object." >&2
  exit 1
fi

# Compact single-line output keeps the log append-safe.
jq -c -n \
  --arg timestamp "$(utc_timestamp)" \
  --arg type "$TYPE" \
  --argjson data "$DATA" \
  '{timestamp: $timestamp, type: $type} + $data' >> "$EVENTS_FILE"
