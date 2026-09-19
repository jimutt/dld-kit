#!/usr/bin/env bash
# Determine the next sequential decision ID by scanning existing files.
# Output: the next ID string, e.g. "DL-004"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

RECORDS_DIR="$(get_records_dir)"

if [[ ! -d "$RECORDS_DIR" ]]; then
  echo "DL-001"
  exit 0
fi

# Find the highest existing DL-NNN across all directories
# Extract just the filename, then parse the numeric ID from it
HIGHEST=$(find "$RECORDS_DIR" -name 'DL-*.md' -type f \
  | xargs -I{} basename {} \
  | sed 's/^DL-\([0-9]*\)\.md$/\1/' \
  | sort -n \
  | tail -1)

if [[ -z "$HIGHEST" ]]; then
  echo "DL-001"
else
  NEXT=$((10#$HIGHEST + 1))
  printf "DL-%03d\n" "$NEXT"
fi
