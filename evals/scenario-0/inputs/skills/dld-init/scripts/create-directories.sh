#!/usr/bin/env bash
# Create the decisions directory structure.
# Usage: create-directories.sh
# Reads mode and namespaces from dld.config.yaml (must exist).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

DECISIONS_DIR="$(get_decisions_dir)"
RECORDS_DIR="$(get_records_dir)"
MODE="$(get_mode)"

mkdir -p "$DECISIONS_DIR"
mkdir -p "$RECORDS_DIR"

if [[ "$MODE" == "namespaced" ]]; then
  get_namespaces | while IFS= read -r ns; do
    if [[ -n "$ns" ]]; then
      mkdir -p "$RECORDS_DIR/$ns"
      touch "$RECORDS_DIR/$ns/.gitkeep"
    fi
  done
fi

echo "Created decisions directory structure."
