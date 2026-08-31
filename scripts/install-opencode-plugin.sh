#!/usr/bin/env bash
# Install the dld-run OpenCode plugin into a project.
#
# Usage:
#   bash /path/to/dld-kit/scripts/install-opencode-plugin.sh [project-dir]
#
# Defaults to the current directory. Symlinks the plugins back to this
# checkout rather than copying them, because bun resolves a symlinked
# module to its real path before resolving that module's imports. That
# gives three things for free:
#
#   - ../dld-core/*.ts resolves inside dld-kit, not inside the project
#   - packageRoot()'s existence walk finds dld-kit unaided, so no source
#     patching is needed (the patching approach silently rotted when the
#     function it rewrote changed shape)
#   - node_modules resolve from dld-kit
#
# Edits in dld-kit take effect the next time OpenCode reloads the plugin.

set -euo pipefail

DLD_KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${1:-$PWD}"

cd "$PROJECT"

if [[ ! -d .git ]]; then
	echo "Error: $PROJECT is not a git repository." >&2
	exit 1
fi

SERVER_SRC="$DLD_KIT/extensions/opencode-dld-run/server.ts"
TUI_SRC="$DLD_KIT/extensions/opencode-dld-run/tui.tsx"
GUARD_SRC="$DLD_KIT/skills/dld-run/scripts/guard-preconditions.sh"

for f in "$SERVER_SRC" "$TUI_SRC" "$GUARD_SRC"; do
	[[ -f "$f" ]] || { echo "Error: missing $f — is $DLD_KIT a dld-kit checkout?" >&2; exit 1; }
done

# The symlinked plugins resolve @opencode-ai/plugin and the TUI peers from
# dld-kit's node_modules, so dld-kit needs its own install.
if [[ ! -d "$DLD_KIT/node_modules/@opencode-ai/plugin" ]]; then
	echo "Installing dld-kit dependencies..."
	(cd "$DLD_KIT" && bun install >/dev/null 2>&1)
fi

PLUGIN_DIR=".opencode/plugins"
TUI_DIR="$PLUGIN_DIR/tui"
mkdir -p "$TUI_DIR"

# Clean up after the older copy-and-patch installer, whose copied dld-core
# shadowed the real one and resolved packageRoot() to the project root.
rm -rf .opencode/dld-core
[[ -L "$PLUGIN_DIR/dld-run.ts" ]] || rm -f "$PLUGIN_DIR/dld-run.ts"
[[ -L "$TUI_DIR/dld-run.tsx" ]] || rm -f "$TUI_DIR/dld-run.tsx"

ln -sfn "$SERVER_SRC" "$PLUGIN_DIR/dld-run.ts"
ln -sfn "$TUI_SRC" "$TUI_DIR/dld-run.tsx"

# Verify rather than assume: load the plugin the way OpenCode will, then ask
# dld-core where it thinks its scripts live. A silent misresolution here is
# what made the previous installer's failure so hard to diagnose.
echo "Verifying resolution through the symlink..."
bun -e "await import('$PWD/$PLUGIN_DIR/dld-run.ts');" >/dev/null || {
	echo "Error: the symlinked plugin failed to load." >&2
	exit 1
}

RESOLVED="$(bun -e "
import { packageRoot, missingScripts } from '$DLD_KIT/extensions/dld-core/paths.ts';
const missing = missingScripts();
console.log(packageRoot());
console.log(missing.length ? 'MISSING: ' + missing.join(', ') : 'all scripts present');
")"
echo "$RESOLVED" | sed 's/^/  /'

case "$RESOLVED" in
	"$DLD_KIT"*) ;;
	*) echo "Error: packageRoot resolved outside dld-kit — the plugin would not find its scripts." >&2; exit 1 ;;
esac
case "$RESOLVED" in
	*MISSING:*) echo "Error: required scripts are missing from $DLD_KIT." >&2; exit 1 ;;
esac

echo "dld-run plugin installed:"
echo "  server: $PROJECT/$PLUGIN_DIR/dld-run.ts -> $SERVER_SRC"
echo "  tui:    $PROJECT/$TUI_DIR/dld-run.tsx -> $TUI_SRC"
echo
echo "Plugins load in OpenCode's background service, not the TUI. If a running"
echo "session does not pick this up, restart the service:"
echo "  pkill -f 'opencode2.*serve --service' && opencode2 -c"
