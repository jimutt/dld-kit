#!/usr/bin/env bash
# Install this extension globally by adding its path to ~/.pi/agent/settings.json.
# Reversible with bin/uninstall-global.sh.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTENSION_PATH="$REPO_ROOT/.pi/extensions/dld.ts"
SETTINGS="$HOME/.pi/agent/settings.json"

if [[ ! -f "$EXTENSION_PATH" ]]; then
  echo "Error: extension entry not found at $EXTENSION_PATH" >&2
  exit 1
fi

if [[ ! -f "$SETTINGS" ]]; then
  echo "Error: $SETTINGS not found. Run 'pi' once to initialize, then retry." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required (brew install jq)." >&2
  exit 1
fi

if jq -e --arg p "$EXTENSION_PATH" '(.extensions // []) | index($p)' "$SETTINGS" >/dev/null; then
  echo "Already installed: $EXTENSION_PATH"
  exit 0
fi

TMP="$(mktemp)"
jq --arg p "$EXTENSION_PATH" '.extensions = ((.extensions // []) + [$p])' "$SETTINGS" > "$TMP"
mv "$TMP" "$SETTINGS"

echo "Installed dld-kit-pi globally."
echo "  Extension: $EXTENSION_PATH"
echo "  Settings:  $SETTINGS"
echo
echo "Restart pi (or run /reload from inside pi) to activate."
