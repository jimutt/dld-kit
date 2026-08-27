#!/usr/bin/env bash
# Append a finding to a run's findings log.
#
# @decision(DL-016)
#
# Usage: add-finding.sh <slug> --item <index> --decisions <DL-A,DL-B> --note <text>
#
# The findings log is append-only markdown: what the agent noticed during the
# run that the plan did not anticipate. It is written for the human reviewing
# the run, not for the agent executing it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

require_jq

SLUG="${1:?Usage: add-finding.sh <slug> --item <index> --decisions <DL-A,DL-B> --note <text>}"
shift

ITEM=""
DECISIONS=""
NOTE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --item) ITEM="$2"; shift 2 ;;
    --decisions) DECISIONS="$2"; shift 2 ;;
    --note) NOTE="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

[[ -n "$ITEM" ]] || { echo "Error: --item is required." >&2; exit 1; }
[[ -n "$NOTE" ]] || { echo "Error: --note is required." >&2; exit 1; }

validate_slug "$SLUG"
RUN_DIR="$(get_run_dir "$SLUG")"
[[ -d "$RUN_DIR" ]] || { echo "Error: run '$SLUG' not found." >&2; exit 1; }

FINDINGS_FILE="$RUN_DIR/findings.md"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Initialize with a header if the file does not exist yet.
if [[ ! -f "$FINDINGS_FILE" ]]; then
  cat > "$FINDINGS_FILE" <<EOF
# Findings — $SLUG

What the agent noticed during the run that the plan did not anticipate.
Newest at the bottom.
EOF
fi

{
  echo ""
  echo "---"
  echo ""
  echo "**Item $ITEM** · $TIMESTAMP"
  if [[ -n "$DECISIONS" ]]; then
    echo "Decisions: $DECISIONS"
  fi
  echo ""
  echo "$NOTE"
} >> "$FINDINGS_FILE"

echo "$FINDINGS_FILE"
