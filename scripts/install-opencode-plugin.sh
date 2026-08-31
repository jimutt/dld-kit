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

PLUGIN_SRC="$DLD_KIT/extensions/opencode-dld-run"
SERVER_SRC="$PLUGIN_SRC/server.ts"
TUI_SRC="$PLUGIN_SRC/tui.tsx"
MANIFEST_SRC="$PLUGIN_SRC/package.json"
GUARD_SRC="$DLD_KIT/skills/dld-run/scripts/guard-preconditions.sh"

for f in "$SERVER_SRC" "$TUI_SRC" "$MANIFEST_SRC" "$GUARD_SRC"; do
	[[ -f "$f" ]] || { echo "Error: missing $f — is $DLD_KIT a dld-kit checkout?" >&2; exit 1; }
done

# The symlinked plugins resolve @opencode-ai/plugin and the TUI peers from
# dld-kit's node_modules, so dld-kit needs its own install.
if [[ ! -d "$DLD_KIT/node_modules/@opencode-ai/plugin" ]]; then
	echo "Installing dld-kit dependencies..."
	(cd "$DLD_KIT" && bun install >/dev/null 2>&1)
fi

PLUGIN_DIR=".opencode/plugins"
PKG_DIR="$PLUGIN_DIR/dld-run"

# A previous version of this installer linked $PKG_DIR straight at dld-kit's
# extension directory. Writing into a path that is a symlink to a directory
# resolves through it, so removing and rewriting "the plugin's files" would
# delete and overwrite dld-kit's own sources. Drop the link itself first, and
# only then create a real directory.
[[ -L "$PKG_DIR" ]] && rm -f "$PKG_DIR"
[[ -L "$PLUGIN_DIR" ]] && rm -f "$PLUGIN_DIR"

mkdir -p "$PKG_DIR"

# Belt and braces for the same class of mistake: never write into anything
# that resolves inside the dld-kit checkout.
PKG_REAL="$(cd "$PKG_DIR" && pwd -P)"
KIT_REAL="$(cd "$DLD_KIT" && pwd -P)"
case "$PKG_REAL/" in
	"$KIT_REAL"/*)
		echo "Error: $PKG_DIR resolves to $PKG_REAL, inside the dld-kit checkout." >&2
		echo "Refusing to write there — remove that path and re-run." >&2
		exit 1
		;;
esac

# Only a package exposing a "./tui" export gets its CLI plugin loaded, so the
# plugin is installed as a package directory rather than as loose files: a
# stray tui.tsx under plugins/ is never discovered, which is why the run had
# no UI surfaces.
#
# The directory and its files are real, not symlinks. A symlinked plugin
# *directory* is skipped by directory discovery (a symlink is not a directory
# to readdir), even though a symlinked loose file is picked up. The files are
# one-line re-exports of the modules in dld-kit, so the code still has exactly
# one home and edits there take effect on reload.
rm -rf .opencode/dld-core "$PLUGIN_DIR/tui"
rm -f "$PLUGIN_DIR/dld-run.ts" "$PKG_DIR/package.json" "$PKG_DIR/server.ts" "$PKG_DIR/tui.tsx"

cat > "$PKG_DIR/package.json" <<'MANIFEST'
{
	"name": "opencode-dld-run",
	"version": "0.9.0",
	"private": true,
	"type": "module",
	"main": "./server.ts",
	"exports": {
		".": "./server.ts",
		"./tui": "./tui.tsx"
	}
}
MANIFEST

printf 'export { default } from "%s";\n' "$SERVER_SRC" > "$PKG_DIR/server.ts"
printf 'export { default } from "%s";\n' "$TUI_SRC" > "$PKG_DIR/tui.tsx"

# Belt and braces: also register the package explicitly. Auto-discovery of
# .opencode/plugins/ is documented, but an explicit entry is what the docs
# guarantee for "configured plugins that expose a TUI component are loaded
# automatically by the CLI". Paths resolve relative to the config file.
CONFIG=".opencode/opencode.json"
if [[ -f "$CONFIG" ]]; then
	if command -v jq >/dev/null 2>&1; then
		if ! jq -e '(.plugins // []) | index("./plugins/dld-run")' "$CONFIG" >/dev/null 2>&1; then
			tmp="$(mktemp)"
			jq '.plugins = ((.plugins // []) + ["./plugins/dld-run"] | unique)' "$CONFIG" > "$tmp" && mv "$tmp" "$CONFIG"
			echo "  registered ./plugins/dld-run in $CONFIG"
		fi
	else
		echo "  note: jq not found — add \"./plugins/dld-run\" to \"plugins\" in $CONFIG yourself" >&2
	fi
else
	cat > "$CONFIG" <<'CONFIGJSON'
{
	"$schema": "https://opencode.ai/config.json",
	"plugins": ["./plugins/dld-run"]
}
CONFIGJSON
	echo "  wrote $CONFIG registering ./plugins/dld-run"
fi

# Verify rather than assume: load the plugin the way OpenCode will, then ask
# dld-core where it thinks its scripts live. A silent misresolution here is
# what made the previous installer's failure so hard to diagnose.
echo "Verifying the installed package loads..."
bun -e "
const server = await import('$PWD/$PKG_DIR/server.ts');
const tui = await import('$PWD/$PKG_DIR/tui.tsx');
for (const [name, mod] of [['server', server], ['tui', tui]]) {
	const def = mod.default;
	if (typeof def?.id !== 'string' || typeof def?.setup !== 'function') {
		throw new Error(name + ' export is not a { id, setup } plugin definition');
	}
}
" >/dev/null || {
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
echo "  package: $PROJECT/$PKG_DIR (re-exports $PLUGIN_SRC)"
echo "           .     -> server.ts (server runtime)"
echo "           ./tui -> tui.tsx  (CLI surfaces)"
echo
echo "Plugins load in OpenCode's background service, not the TUI. If a running"
echo "session does not pick this up, restart the service:"
echo "  pkill -f 'opencode2.*serve --service' && opencode2 -c"
