#!/usr/bin/env bash
# Read a run's findings log.
#
# @decision(DL-016)
#
# Usage: get-findings.sh <slug> [--count]
#
# Prints the findings log's content. --count prints only the number of
# findings (separator blocks), useful for the status line and board.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

SLUG="${1:?Usage: get-findings.sh <slug> [--count]}"
shift || true

COUNT=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --count) COUNT=true; shift ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

validate_slug "$SLUG"
RUN_DIR="$(get_run_dir "$SLUG")"
FINDINGS_FILE="$RUN_DIR/findings.md"

if [[ ! -f "$FINDINGS_FILE" ]]; then
  if [[ "$COUNT" == true ]]; then
    echo "0"
  fi
  exit 0
fi

if [[ "$COUNT" == true ]]; then
  grep -c "^---$" "$FINDINGS_FILE" || true
else
  cat "$FINDINGS_FILE"
fi
