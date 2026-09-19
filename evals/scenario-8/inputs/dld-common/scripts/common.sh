#!/usr/bin/env bash
# Common functions for DLD scripts

set -euo pipefail

# Resolve the project root (git root, or pwd if not in a git repo)
get_project_root() {
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

# Read dld.config.yaml and extract a field value
# Usage: config_get <field>
# Relies on simple YAML structure (no nesting beyond namespaces list)
config_get() {
  local field="$1"
  local root
  root="$(get_project_root)"
  local config="$root/dld.config.yaml"

  if [[ ! -f "$config" ]]; then
    echo "Error: dld.config.yaml not found. Run /dld-init first." >&2
    exit 1
  fi

  grep -F "${field}:" "$config" | grep "^${field}:" | head -1 | sed "s/^${field}:[[:space:]]*//" | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/"
}

# Get the decisions directory (absolute path)
get_decisions_dir() {
  local root
  root="$(get_project_root)"
  local dir
  dir="$(config_get decisions_dir)"
  echo "$root/$dir"
}

# Get the records directory where DL-*.md files live (absolute path)
get_records_dir() {
  echo "$(get_decisions_dir)/records"
}

# Get project mode (flat or namespaced)
get_mode() {
  config_get mode
}

# Get list of namespaces (one per line)
get_namespaces() {
  local root
  root="$(get_project_root)"
  local config="$root/dld.config.yaml"
  sed -n '/^namespaces:/,/^[^[:space:]-]/{ /^[[:space:]]*-/s/^[[:space:]]*-[[:space:]]*//p; }' "$config" | sed 's/[[:space:]]*$//'
}
