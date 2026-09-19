#!/usr/bin/env bash
# Verify that each decision ID has at least one @decision annotation in the codebase.
# Usage: verify-annotations.sh DL-001 DL-002 ...
# Exits 0 if all decisions have annotations, 1 if any are missing.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../dld-common/scripts/common.sh"

if [[ $# -eq 0 ]]; then
  echo "Usage: verify-annotations.sh DL-001 DL-002 ..." >&2
  exit 1
fi

ROOT="$(get_project_root)"
DECISIONS_DIR="$(get_decisions_dir)"
PREFIX="$(config_get annotation_prefix)"
PREFIX="${PREFIX:-@decision}"

# Get relative path of decisions dir for exclusion
DECISIONS_REL="${DECISIONS_DIR#"$ROOT"/}"

missing=()

for id in "$@"; do
  # Search all files for the annotation, excluding non-source directories
  if ! grep -rl "${PREFIX}(${id})" "$ROOT" \
    --exclude-dir="${DECISIONS_REL}" \
    --exclude-dir=".git" \
    --exclude-dir="node_modules" \
    --exclude-dir=".next" \
    --exclude-dir="dist" \
    --exclude-dir="build" \
    --exclude-dir="out" \
    --exclude-dir="target" \
    --exclude-dir=".gradle" \
    --exclude-dir="vendor" \
    --exclude-dir="__pycache__" \
    --exclude-dir=".venv" \
    --exclude-dir=".tessl" \
    2>/dev/null | head -1 > /dev/null 2>&1; then
    missing+=("$id")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "MISSING annotations in source code for: ${missing[*]}"
  echo "Every implemented decision must have at least one ${PREFIX}(DL-NNN) annotation in the codebase."
  exit 1
fi

echo "All decisions have code annotations."
exit 0
