#!/usr/bin/env bash
# Remove this extension's path from ~/.pi/agent/settings.json.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTENSION_PATH="$REPO_ROOT/.pi/extensions/dld.ts"
SETTINGS="$HOME/.pi/agent/settings.json"

if [[ ! -f "$SETTINGS" ]]; then
  echo "$SETTINGS not found — nothing to remove."
  exit 0
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required (brew install jq)." >&2
  exit 1
fi

if ! jq -e --arg p "$EXTENSION_PATH" '(.extensions // []) | index($p)' "$SETTINGS" >/dev/null; then
  echo "Not installed (no entry for $EXTENSION_PATH in $SETTINGS)."
  exit 0
fi

TMP="$(mktemp)"
jq --arg p "$EXTENSION_PATH" '.extensions = ((.extensions // []) - [$p])
                              | if .extensions == [] then del(.extensions) else . end' \
  "$SETTINGS" > "$TMP"
mv "$TMP" "$SETTINGS"

echo "Uninstalled dld-kit-pi from $SETTINGS."
echo "Restart pi to deactivate."
