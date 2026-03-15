#!/usr/bin/env bash
# Collect all proposed decisions and output their content.
# Output: each decision's full file content, separated by a marker line.
# The marker format is: ===DLD_DECISION_BOUNDARY===
# This allows the agent to split and process decisions individually.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

RECORDS_DIR="$(get_records_dir)"

if [[ ! -d "$RECORDS_DIR" ]]; then
  exit 0
fi

# Find all decision files, sorted by numeric ID ascending
FILES=$(find "$RECORDS_DIR" -name 'DL-*.md' -type f \
  | awk -F/ '{file=$0; basename=$NF; gsub(/^DL-/,"",basename); gsub(/\.md$/,"",basename); print basename "\t" file}' \
  | sort -n \
  | cut -f2)

if [[ -z "$FILES" ]]; then
  exit 0
fi

FIRST=true
while IFS= read -r file; do
  STATUS=$(sed -n '/^---$/,/^---$/p' "$file" \
    | grep "^status:" \
    | head -1 \
    | sed 's/^status:[[:space:]]*//')

  if [[ "$STATUS" == "proposed" ]]; then
    if $FIRST; then
      FIRST=false
    else
      echo "===DLD_DECISION_BOUNDARY==="
    fi
    cat "$file"
  fi
done <<< "$FILES"
