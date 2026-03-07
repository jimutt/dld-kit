#!/usr/bin/env bash
# Update the audit tracking state in .dld-state.yaml.
# Records the current timestamp and HEAD commit hash.
# Usage: update-audit-state.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

DECISIONS_DIR="$(get_decisions_dir)"
STATE_FILE="$DECISIONS_DIR/.dld-state.yaml"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
COMMIT_HASH="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"

AUDIT_BLOCK="audit:
  last_run: $TIMESTAMP
  commit_hash: $COMMIT_HASH"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "$AUDIT_BLOCK" > "$STATE_FILE"
else
  TMPFILE=$(mktemp)
  if grep -q "^audit:" "$STATE_FILE"; then
    # Replace existing audit section, preserve everything else
    in_audit=false
    # Use cat to handle files without trailing newline
    { cat "$STATE_FILE"; echo; } | while IFS= read -r line; do
      if [[ "$line" == "audit:" ]]; then
        in_audit=true
        echo "$AUDIT_BLOCK"
        continue
      fi
      if $in_audit; then
        # Skip lines that are indented (part of the audit block)
        # Stop skipping at blank lines or non-indented lines
        if [[ "$line" =~ ^[[:space:]][[:space:]] ]]; then
          continue
        else
          in_audit=false
        fi
      fi
      echo "$line"
    done > "$TMPFILE"
    # Remove any trailing blank lines added by the echo
    sed -i.bak -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$TMPFILE" 2>/dev/null && rm -f "$TMPFILE.bak" || true
  else
    # Append audit section
    cp "$STATE_FILE" "$TMPFILE"
    echo "" >> "$TMPFILE"
    echo "$AUDIT_BLOCK" >> "$TMPFILE"
  fi
  mv "$TMPFILE" "$STATE_FILE"
fi

echo "Audit state updated: $TIMESTAMP at $COMMIT_HASH"
