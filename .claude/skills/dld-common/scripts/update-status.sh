#!/usr/bin/env bash
# Update the status field in a decision record's YAML frontmatter.
# Usage: update-status.sh <DL-NNN> <new-status>
# Finds the decision file across all directories and updates the status field in-place.
# Only modifies the status field within the YAML frontmatter (between --- markers).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

ID="${1:?Usage: update-status.sh <DL-NNN> <new-status>}"
NEW_STATUS="${2:?Usage: update-status.sh <DL-NNN> <new-status>}"

# Validate status value
case "$NEW_STATUS" in
  proposed|accepted|deprecated|superseded) ;;
  *) echo "Error: invalid status '$NEW_STATUS'. Must be: proposed, accepted, deprecated, superseded." >&2; exit 1 ;;
esac

DECISIONS_DIR="$(get_decisions_dir)"

# Find the decision file
FILE=$(find "$DECISIONS_DIR" -name "$ID.md" -type f | head -1)

if [[ -z "$FILE" ]]; then
  echo "Error: decision $ID not found." >&2
  exit 1
fi

# Update status only within YAML frontmatter (between first and second --- lines)
TMPFILE=$(mktemp)

frontmatter_count=0
in_frontmatter=false

while IFS= read -r line; do
  if [[ "$line" == "---" ]]; then
    frontmatter_count=$((frontmatter_count + 1))
    if [[ $frontmatter_count -eq 1 ]]; then
      in_frontmatter=true
    elif [[ $frontmatter_count -eq 2 ]]; then
      in_frontmatter=false
    fi
    echo "$line" >> "$TMPFILE"
    continue
  fi

  if $in_frontmatter && [[ "$line" =~ ^status: ]]; then
    echo "status: $NEW_STATUS" >> "$TMPFILE"
  else
    echo "$line" >> "$TMPFILE"
  fi
done < "$FILE"

mv "$TMPFILE" "$FILE"

echo "Updated $ID status to $NEW_STATUS."
