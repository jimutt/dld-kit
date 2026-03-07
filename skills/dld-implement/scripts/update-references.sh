#!/usr/bin/env bash
# Update the references field in a decision record's YAML frontmatter.
# Usage: update-references.sh <DL-NNN> <references-file>
# The references-file is a path to a file containing YAML list entries, e.g.:
#   - path: src/foo.ts
#     symbol: bar
#   - path: src/baz.ts
#
# The agent writes the references to a temp file, then passes the path.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

ID="${1:?Usage: update-references.sh <DL-NNN> <references-file>}"
REFS_FILE="${2:?Usage: update-references.sh <DL-NNN> <references-file>}"

if [[ ! -f "$REFS_FILE" ]]; then
  echo "Error: references file not found: $REFS_FILE" >&2
  exit 1
fi

DECISIONS_DIR="$(get_decisions_dir)"

# Find the decision file
FILE=$(find "$DECISIONS_DIR" -name "$ID.md" -type f | head -1)

if [[ -z "$FILE" ]]; then
  echo "Error: decision $ID not found." >&2
  exit 1
fi

# Replace the references field in the YAML frontmatter.
# Strategy: process line by line, tracking frontmatter boundaries.

TMPFILE=$(mktemp)

in_frontmatter=false
in_refs=false
frontmatter_count=0

while IFS= read -r line; do
  if [[ "$line" == "---" ]]; then
    frontmatter_count=$((frontmatter_count + 1))
    if [[ $frontmatter_count -eq 1 ]]; then
      in_frontmatter=true
    elif [[ $frontmatter_count -eq 2 ]]; then
      in_frontmatter=false
      # If we were still skipping old refs, stop now
      in_refs=false
    fi
    echo "$line" >> "$TMPFILE"
    continue
  fi

  if $in_frontmatter && [[ "$line" =~ ^references: ]]; then
    # Write new references block
    echo "references:" >> "$TMPFILE"
    while IFS= read -r ref_line; do
      echo "  $ref_line" >> "$TMPFILE"
    done < "$REFS_FILE"
    # Skip old references value
    if [[ "$line" =~ ^references:\ *\[ ]]; then
      # Inline value (e.g., references: []) — already consumed this line
      :
    else
      # Multi-line block — need to skip indented continuation lines
      in_refs=true
    fi
    continue
  fi

  if $in_refs; then
    # Skip indented lines that are part of the old references block
    if [[ "$line" =~ ^[[:space:]]+(- |[a-z]) ]]; then
      continue
    else
      in_refs=false
    fi
  fi

  echo "$line" >> "$TMPFILE"
done < "$FILE"

mv "$TMPFILE" "$FILE"

echo "Updated $ID references."
