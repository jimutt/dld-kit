#!/usr/bin/env bash
# Detect what changed since the last snapshot run.
# Reads .dld-state.yaml for snapshot.decisions_included and snapshot.commit_hash,
# then compares against current state to produce a structured changeset.
#
# Output format (YAML-like):
#   mode: full|incremental
#   new_decisions: DL-072, DL-073
#   modified_decisions: DL-015, DL-030
#   commit_range: abc1234..def5678
#
# mode=full when no prior state exists or SNAPSHOT.md/OVERVIEW.md are missing.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

DECISIONS_DIR="$(get_decisions_dir)"
RECORDS_DIR="$(get_records_dir)"
STATE_FILE="$DECISIONS_DIR/.dld-state.yaml"

# Check if we have prior snapshot state
if [[ ! -f "$STATE_FILE" ]] || ! grep -q "^snapshot:" "$STATE_FILE"; then
  echo "mode: full"
  exit 0
fi

# Check if SNAPSHOT.md and OVERVIEW.md exist
if [[ ! -f "$DECISIONS_DIR/SNAPSHOT.md" ]] || [[ ! -f "$DECISIONS_DIR/OVERVIEW.md" ]]; then
  echo "mode: full"
  exit 0
fi

# Read previous snapshot state
PREV_INCLUDED=$(sed -n '/^snapshot:/,/^[^[:space:]]/{ s/^  decisions_included:[[:space:]]*//p; }' "$STATE_FILE" | head -1)
PREV_COMMIT=$(sed -n '/^snapshot:/,/^[^[:space:]]/{ s/^  commit_hash:[[:space:]]*//p; }' "$STATE_FILE" | head -1)
PREV_RUN=$(sed -n '/^snapshot:/,/^[^[:space:]]/{ s/^  last_run:[[:space:]]*//p; }' "$STATE_FILE" | head -1)

# If no decisions_included recorded, do full
if [[ -z "$PREV_INCLUDED" ]]; then
  echo "mode: full"
  exit 0
fi

# If no commit_hash but we have last_run, derive a baseline commit from timestamp
if [[ -z "$PREV_COMMIT" || "$PREV_COMMIT" == "unknown" ]] && [[ -n "$PREV_RUN" ]]; then
  # Find the most recent commit at or before last_run timestamp
  PREV_COMMIT=$(git log --until="$PREV_RUN" --format='%h' -1 2>/dev/null || true)
fi

# Find new accepted decisions (ID > decisions_included)
NEW_DECISIONS=""
for file in $(find "$RECORDS_DIR" -name 'DL-*.md' -type f 2>/dev/null); do
  NUM=$(basename "$file" | sed 's/^DL-\([0-9]*\)\.md$/\1/')
  if [[ $((10#$NUM)) -gt $((10#$PREV_INCLUDED)) ]]; then
    STATUS=$(sed -n '/^---$/,/^---$/p' "$file" \
      | grep "^status:" \
      | head -1 \
      | sed 's/^status:[[:space:]]*//')
    if [[ "$STATUS" == "accepted" ]]; then
      ID="DL-$(printf '%03d' $((10#$NUM)))"
      if [[ -n "$NEW_DECISIONS" ]]; then
        NEW_DECISIONS="$NEW_DECISIONS, $ID"
      else
        NEW_DECISIONS="$ID"
      fi
    fi
  fi
done

# Find modified decisions via git diff since last commit
MODIFIED_DECISIONS=""
COMMIT_RANGE=""
if [[ -n "$PREV_COMMIT" && "$PREV_COMMIT" != "unknown" ]]; then
  # Verify the commit is reachable
  if git cat-file -t "$PREV_COMMIT" &>/dev/null; then
    CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    if [[ "$PREV_COMMIT" != "$CURRENT_COMMIT" ]]; then
      COMMIT_RANGE="${PREV_COMMIT}..HEAD"
      # Get decision files changed since last snapshot commit
      CHANGED_FILES=$(git diff --name-only "$COMMIT_RANGE" -- "$RECORDS_DIR" 2>/dev/null || true)
      for changed in $CHANGED_FILES; do
        BASENAME=$(basename "$changed")
        # Only consider DL-*.md files
        if [[ "$BASENAME" =~ ^DL-[0-9]+\.md$ ]]; then
          NUM=$(echo "$BASENAME" | sed 's/^DL-\([0-9]*\)\.md$/\1/')
          # Only report modifications to decisions that were in the previous snapshot
          if [[ $((10#$NUM)) -le $((10#$PREV_INCLUDED)) ]]; then
            ID="DL-$(printf '%03d' $((10#$NUM)))"
            if [[ -n "$MODIFIED_DECISIONS" ]]; then
              MODIFIED_DECISIONS="$MODIFIED_DECISIONS, $ID"
            else
              MODIFIED_DECISIONS="$ID"
            fi
          fi
        fi
      done
    fi
  fi
fi

# If nothing changed, still report incremental with empty changeset
echo "mode: incremental"
echo "new_decisions: ${NEW_DECISIONS:-}"
echo "modified_decisions: ${MODIFIED_DECISIONS:-}"
echo "commit_range: ${COMMIT_RANGE:-}"
