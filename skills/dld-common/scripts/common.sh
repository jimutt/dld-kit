#!/usr/bin/env bash
# Common functions for DLD scripts

set -euo pipefail

# Resolve the project root (git root)
get_project_root() {
  git rev-parse --show-toplevel 2>/dev/null || {
    echo "Error: not a git repository" >&2
    exit 1
  }
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

# Read dld.config.yaml and extract an optional field value.
# Unlike config_get, a missing field is not an error — the default is returned.
# Usage: config_get_optional <field> [default]
config_get_optional() {
  local field="$1"
  local default="${2:-}"
  local root
  root="$(get_project_root)"
  local config="$root/dld.config.yaml"

  if [[ ! -f "$config" ]]; then
    echo "$default"
    return 0
  fi

  local value
  value="$(grep "^${field}:" "$config" | head -1 | sed "s/^${field}:[[:space:]]*//" | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/" || true)"

  if [[ -z "$value" ]]; then
    echo "$default"
  else
    echo "$value"
  fi
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

# --- Goal run helpers ---
# @decision(DL-001)

# Get the directory holding goal run state (absolute path).
# Run state is local working state, not part of the decision log.
get_runs_dir() {
  echo "$(get_project_root)/.dld/runs"
}

# Get the directory for a single run (absolute path). Does not check existence.
# Usage: get_run_dir <slug>
get_run_dir() {
  local slug="${1:?Usage: get_run_dir <slug>}"
  echo "$(get_runs_dir)/$slug"
}

# Fail with a clear message when jq is unavailable.
# Goal run state is JSON; the dld-goal scripts require jq to read and mutate it.
# Print the caller script's usage from its header comment, stopping at the
# first line that is not a comment. Scripts source common.sh, so the script
# whose usage we want is BASH_SOURCE[1]; BASH_SOURCE[0] is common.sh itself.
usage() {
  sed -n '2,$p' "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}" \
    | sed -n '/^[^#]/q; p' \
    | sed 's/^# \{0,1\}//' >&2
}

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq is required by the dld-goal scripts but was not found on PATH." >&2
    echo "Install it (e.g. 'brew install jq' or 'apt-get install jq') and retry." >&2
    exit 1
  fi
}

# Validate a run slug: lowercase alphanumerics and hyphens, no leading/trailing hyphen.
# Usage: validate_slug <slug>
validate_slug() {
  local slug="${1:-}"
  if [[ ! "$slug" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo "Error: invalid run slug '$slug'. Use lowercase letters, digits, and hyphens." >&2
    exit 1
  fi
}

# Current UTC timestamp in the format used across DLD artifacts.
utc_timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Locate a decision record by ID across flat and namespaced layouts.
# Usage: find_decision_file <DL-NNN>
# @decision(DL-002)
find_decision_file() {
  local id="${1:?Usage: find_decision_file <DL-NNN>}"
  local records_dir
  records_dir="$(get_records_dir)"
  local file
  file="$(find "$records_dir" -name "$id.md" -type f 2>/dev/null | head -1)"
  if [[ -z "$file" ]]; then
    echo "Error: decision $id not found under $records_dir." >&2
    exit 1
  fi
  echo "$file"
}

# Hash stdin with SHA-256, printing the bare hex digest.
# @decision(DL-002)
sha256_stdin() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    echo "Error: no SHA-256 tool found (looked for shasum and sha256sum)." >&2
    exit 1
  fi
}
