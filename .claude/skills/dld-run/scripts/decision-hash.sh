#!/usr/bin/env bash
# Print the intent hash of a decision record.
#
# @decision(DL-002)
#
# Usage: decision-hash.sh <DL-NNN>
#
# The hash covers the fields that carry intent — title, supersedes, amends, and
# the full body — and deliberately excludes volatile frontmatter (status,
# references, timestamp). Accepting a decision or letting an audit refresh its
# references must not invalidate a pinned work item; rewriting what the decision
# actually says must.
#
# Prints "sha256:<hex>".

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

ID="${1:?Usage: decision-hash.sh <DL-NNN>}"

FILE="$(find_decision_file "$ID")"

DIGEST="$(
  {
    # Intent-carrying frontmatter fields, in file order.
    awk 'BEGIN{c=0} /^---$/{c++; next} c==1 && /^(title|supersedes|amends):/' "$FILE"
    # Everything after the closing frontmatter delimiter.
    awk 'BEGIN{c=0} /^---$/{c++; next} c>=2' "$FILE"
  } | sha256_stdin
)"

echo "sha256:$DIGEST"
