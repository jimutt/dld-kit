#!/usr/bin/env bash
# Find decisions that reference other decision IDs in their body
# but don't list them in supersedes or amends.
# Output: one line per candidate in the format: <source-id>:<referenced-id>
# Outputs nothing (exit 0) if no candidates found.
# These are candidates — the agent must evaluate whether the reference
# is actually a partial modification or just informational.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

RECORDS_DIR="$(get_records_dir)"

# Find all decision files
shopt -s nullglob
files=("$RECORDS_DIR"/DL-*.md "$RECORDS_DIR"/*/DL-*.md)
shopt -u nullglob

if [[ ${#files[@]} -eq 0 ]]; then
  exit 0
fi

for file in "${files[@]}"; do
  id=$(basename "$file" .md)

  # Extract supersedes and amends from frontmatter (between --- markers)
  frontmatter=$(sed -n '1,/^---$/{ /^---$/d; p; }; /^---$/,/^---$/{ /^---$/d; p; }' "$file" | head -50)
  declared=$(echo "$frontmatter" | grep -E '^(supersedes|amends):' | grep -oE 'DL-[0-9]+' || true)

  # Extract body (everything after the second ---)
  body=$(awk 'BEGIN{n=0} /^---$/{n++; next} n>=2{print}' "$file")

  # Find DL-IDs referenced in the body
  body_refs=$(echo "$body" | grep -oE 'DL-[0-9]+' | sort -u || true)

  if [[ -z "$body_refs" ]]; then
    continue
  fi

  for ref in $body_refs; do
    # Skip self-references
    if [[ "$ref" == "$id" ]]; then
      continue
    fi

    # Skip if already declared in supersedes or amends
    if echo "$declared" | grep -qF "$ref" 2>/dev/null; then
      continue
    fi

    echo "$id:$ref"
  done
done
