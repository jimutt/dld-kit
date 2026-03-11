#!/usr/bin/env bash
# Update the snapshot tracking state in .dld-state.yaml.
# Records the current timestamp, highest accepted decision ID,
# and per-artifact timestamps.
# Usage: update-snapshot-state.sh [ARTIFACT_NAME...]
#
# Without arguments, records timestamps for the built-in artifacts
# (SNAPSHOT.md and OVERVIEW.md). With arguments, also records timestamps
# for the named custom artifacts.
#
# Example: update-snapshot-state.sh ONBOARDING.md API-CONTRACTS.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

DECISIONS_DIR="$(get_decisions_dir)"
RECORDS_DIR="$(get_records_dir)"
STATE_FILE="$DECISIONS_DIR/.dld-state.yaml"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Find the highest accepted decision ID by checking status in frontmatter
HIGHEST_NUM=0
for file in $(find "$RECORDS_DIR" -name 'DL-*.md' -type f); do
  STATUS=$(sed -n '/^---$/,/^---$/p' "$file" \
    | grep "^status:" \
    | head -1 \
    | sed 's/^status:[[:space:]]*//')
  if [[ "$STATUS" == "accepted" ]]; then
    NUM=$(basename "$file" | sed 's/^DL-\([0-9]*\)\.md$/\1/')
    if [[ $((10#$NUM)) -gt $HIGHEST_NUM ]]; then
      HIGHEST_NUM=$((10#$NUM))
    fi
  fi
done

# Build the artifacts block — always includes SNAPSHOT.md and OVERVIEW.md
ARTIFACTS_BLOCK="    SNAPSHOT.md: $TIMESTAMP
    OVERVIEW.md: $TIMESTAMP"

# Append any custom artifact names passed as arguments
for artifact in "$@"; do
  ARTIFACTS_BLOCK="$ARTIFACTS_BLOCK
    $artifact: $TIMESTAMP"
done

SNAPSHOT_BLOCK="snapshot:
  last_run: $TIMESTAMP
  decisions_included: $HIGHEST_NUM
  artifacts:
$ARTIFACTS_BLOCK"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "$SNAPSHOT_BLOCK" > "$STATE_FILE"
else
  TMPFILE=$(mktemp)
  if grep -q "^snapshot:" "$STATE_FILE"; then
    # Replace existing snapshot section
    in_snapshot=false
    { cat "$STATE_FILE"; echo; } | while IFS= read -r line; do
      if [[ "$line" == "snapshot:" ]]; then
        in_snapshot=true
        echo "$SNAPSHOT_BLOCK"
        continue
      fi
      if $in_snapshot; then
        if [[ "$line" =~ ^[[:space:]][[:space:]] ]]; then
          continue
        else
          in_snapshot=false
        fi
      fi
      echo "$line"
    done > "$TMPFILE"
    sed -i.bak -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$TMPFILE" 2>/dev/null && rm -f "$TMPFILE.bak" || true
  else
    # Append snapshot section
    cp "$STATE_FILE" "$TMPFILE"
    echo "" >> "$TMPFILE"
    echo "$SNAPSHOT_BLOCK" >> "$TMPFILE"
  fi
  mv "$TMPFILE" "$STATE_FILE"
fi

echo "Snapshot state updated: $TIMESTAMP (through DL-$(printf '%03d' $HIGHEST_NUM))"
