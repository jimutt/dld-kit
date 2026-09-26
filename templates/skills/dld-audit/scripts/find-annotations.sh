#!/usr/bin/env bash
# Find all @decision annotations in the codebase.
# Output: one line per annotation in the format: <file>:<line>:<DL-NNN>
# Outputs nothing (exit 0) if no annotations are found.
# Searches all text files, excluding non-source directories.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

ROOT="$(get_project_root)"
DECISIONS_DIR="$(get_decisions_dir)"
ANNOTATION_PREFIX="$(config_get annotation_prefix)"

# Search all text files for annotations, excluding non-source directories.
# Uses --binary-files=without-match to skip binary files instead of whitelisting extensions.
# || true prevents exit 1 when grep finds no matches.
MATCHES=$(grep -Ern --binary-files=without-match \
  "${ANNOTATION_PREFIX}\(DL-[0-9]+\)" "$ROOT" \
  --exclude-dir="$(basename "$DECISIONS_DIR")" \
  --exclude-dir='.claude' \
  --exclude-dir='.git' \
  --exclude-dir='.tessl' \
  --exclude-dir='node_modules' \
  --exclude-dir='vendor' \
  --exclude-dir='.venv' \
  --exclude-dir='__pycache__' \
  --exclude-dir='target' \
  --exclude-dir='dist' \
  --exclude-dir='build' \
  --exclude-dir='.next' \
  --exclude-dir='coverage' \
  --exclude='*.lock' \
  --exclude='*.min.js' \
  --exclude='*.min.css' \
  --exclude='*.map' \
  2>/dev/null || true)

if [[ -z "$MATCHES" ]]; then
  exit 0
fi

echo "$MATCHES" \
  | sed "s|^$ROOT/||" \
  | while IFS= read -r line; do
    file_and_line=$(echo "$line" | cut -d: -f1-2)
    echo "$line" | grep -oE 'DL-[0-9]+' | while IFS= read -r id; do
      echo "$file_and_line:$id"
    done
  done
