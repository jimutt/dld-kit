#!/usr/bin/env bash
# Run all DLD Kit tests
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BATS="$SCRIPT_DIR/bats/bin/bats"

if [[ ! -x "$BATS" ]]; then
  echo "Error: bats not found. Run: git submodule update --init --recursive" >&2
  exit 1
fi

"$BATS" "$SCRIPT_DIR"/test_*.bats "$@"
