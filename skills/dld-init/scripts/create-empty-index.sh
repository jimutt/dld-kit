#!/usr/bin/env bash
# Create an empty INDEX.md in the decisions directory.
# Usage: create-empty-index.sh
# Reads mode and decisions_dir from dld.config.yaml (must exist).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

DECISIONS_DIR="$(get_decisions_dir)"
MODE="$(get_mode)"
INDEX="$DECISIONS_DIR/INDEX.md"

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
} > "$INDEX"

echo "Created $INDEX"
