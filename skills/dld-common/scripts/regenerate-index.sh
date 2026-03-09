#!/usr/bin/env bash
# Regenerate decisions/INDEX.md from all decision files.
# Reads YAML frontmatter from each DL-*.md file and builds a markdown table.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

DECISIONS_DIR="$(get_decisions_dir)"
RECORDS_DIR="$(get_records_dir)"
MODE="$(get_mode)"
INDEX_FILE="$DECISIONS_DIR/INDEX.md"

if [[ ! -d "$RECORDS_DIR" ]]; then
  echo "Error: records directory not found at $RECORDS_DIR" >&2
  exit 1
fi

# Extract a frontmatter field from a decision file
# Usage: extract_field <file> <field>
extract_field() {
  local file="$1"
  local field="$2"
  # Read between --- markers, find the field
  sed -n '/^---$/,/^---$/p' "$file" \
    | grep "^${field}:" \
    | head -1 \
    | sed "s/^${field}:[[:space:]]*//" \
    | sed 's/^"\(.*\)"$/\1/' \
    | sed "s/^'\(.*\)'$/\1/"
}

# Extract array field as comma-separated string
# Usage: extract_array_field <file> <field>
extract_array_field() {
  local file="$1"
  local field="$2"
  local raw
  raw=$(extract_field "$file" "$field")
  # Handle YAML inline array: [tag1, tag2, tag3]
  echo "$raw" | sed 's/^\[//;s/\]$//;s/,[[:space:]]*/,/g;s/,/, /g'
}

# Collect all decision files
# Sort by numeric ID descending: extract ID number, sort, reconstruct
DECISION_FILES=$(find "$RECORDS_DIR" -name 'DL-*.md' -type f \
  | awk -F/ '{file=$0; basename=$NF; gsub(/^DL-/,"",basename); gsub(/\.md$/,"",basename); print basename "\t" file}' \
  | sort -n -r \
  | cut -f2)

if [[ -z "$DECISION_FILES" ]]; then
  # Write empty index
  {
    echo "# Decision Log"
    echo ""
    if [[ "$MODE" == "namespaced" ]]; then
      echo "| ID | Title | Status | Namespace | Tags |"
      echo "|----|-------|--------|-----------|------|"
    else
      echo "| ID | Title | Status | Tags |"
      echo "|----|-------|--------|------|"
    fi
  } > "$INDEX_FILE"
  echo "INDEX.md regenerated (empty)."
  exit 0
fi

# Build the index
{
  echo "# Decision Log"
  echo ""
  if [[ "$MODE" == "namespaced" ]]; then
    echo "| ID | Title | Status | Namespace | Tags |"
    echo "|----|-------|--------|-----------|------|"
  else
    echo "| ID | Title | Status | Tags |"
    echo "|----|-------|--------|------|"
  fi

  echo "$DECISION_FILES" | while IFS= read -r file; do
    id=$(extract_field "$file" "id")
    title=$(extract_field "$file" "title")
    status=$(extract_field "$file" "status")
    tags=$(extract_array_field "$file" "tags")

    if [[ "$MODE" == "namespaced" ]]; then
      namespace=$(extract_field "$file" "namespace")
      echo "| $id | $title | $status | $namespace | $tags |"
    else
      echo "| $id | $title | $status | $tags |"
    fi
  done
} > "$INDEX_FILE"

echo "INDEX.md regenerated."
