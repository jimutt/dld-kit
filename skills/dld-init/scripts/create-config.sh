#!/usr/bin/env bash
# Create dld.config.yaml at the project root.
# Usage: create-config.sh <mode> [namespace1 namespace2 ...]
#   mode: "flat" or "namespaced"
#   namespaces: space-separated list (only when mode is "namespaced")

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

MODE="${1:?Usage: create-config.sh <flat|namespaced> [namespace1 namespace2 ...]}"
shift
NAMESPACES=("$@")

# Validate mode
case "$MODE" in
  flat|namespaced) ;;
  *) echo "Error: mode must be 'flat' or 'namespaced', got '$MODE'." >&2; exit 1 ;;
esac

# Require at least one namespace when mode is namespaced
if [[ "$MODE" == "namespaced" && ${#NAMESPACES[@]} -eq 0 ]]; then
  echo "Error: namespaced mode requires at least one namespace." >&2
  exit 1
fi

ROOT="$(get_project_root)"
CONFIG="$ROOT/dld.config.yaml"

if [[ -f "$CONFIG" ]]; then
  echo "Error: dld.config.yaml already exists." >&2
  exit 1
fi

{
  echo "decisions_dir: decisions"
  echo "mode: $MODE"
  if [[ "$MODE" == "namespaced" ]]; then
    echo "namespaces:"
    for ns in "${NAMESPACES[@]}"; do
      echo "  - $ns"
    done
  fi
  echo "annotation_prefix: '@decision'"
} > "$CONFIG"

echo "Created $CONFIG"
