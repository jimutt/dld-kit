#!/usr/bin/env bash
# Regenerate decisions/INDEX.md from all decision files.
# Reads YAML frontmatter from each DL-*.md file and builds a markdown table.
#
# Optional --include-base <ref>: also include decision files from the given git
# ref (e.g. origin/main) that are not present in the working tree. Used by
# /dld-reindex so a pre-rebase INDEX.md contains both renamed-local rows and
# base-branch rows the local commit hasn't seen yet — the rebase then auto-merges.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

INCLUDE_BASE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --include-base) INCLUDE_BASE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

DECISIONS_DIR="$(get_decisions_dir)"
RECORDS_DIR="$(get_records_dir)"
MODE="$(get_mode)"
INDEX_FILE="$DECISIONS_DIR/INDEX.md"
PROJECT_ROOT="$(get_project_root)"
RECORDS_DIR_REL="${RECORDS_DIR#"$PROJECT_ROOT"/}"

if [[ ! -d "$RECORDS_DIR" ]]; then
  echo "Error: records directory not found at $RECORDS_DIR" >&2
  exit 1
fi

if [[ -n "$INCLUDE_BASE" ]]; then
  if ! git -C "$PROJECT_ROOT" rev-parse --verify --quiet "$INCLUDE_BASE^{commit}" >/dev/null; then
    echo "Error: --include-base ref '$INCLUDE_BASE' not found." >&2
    exit 1
  fi
fi

# Read the body of a "source spec" — either local:<path> or base:<path>.
read_source() {
  local source="$1"
  case "$source" in
    base:*) git -C "$PROJECT_ROOT" show "$INCLUDE_BASE:${source#base:}" 2>/dev/null ;;
    local:*) cat "${source#local:}" ;;
    *) cat "$source" ;;  # backward compat
  esac
}

# Extract a frontmatter field from a source spec.
extract_field() {
  local source="$1"
  local field="$2"
  read_source "$source" \
    | sed -n '/^---$/,/^---$/p' \
    | grep "^${field}:" \
    | head -1 \
    | sed "s/^${field}:[[:space:]]*//" \
    | sed 's/^"\(.*\)"$/\1/' \
    | sed "s/^'\(.*\)'$/\1/"
}

# Extract array field as comma-separated string.
extract_array_field() {
  local source="$1"
  local field="$2"
  local raw
  raw=$(extract_field "$source" "$field")
  echo "$raw" | sed 's/^\[//;s/\]$//;s/,[[:space:]]*/,/g;s/,/, /g'
}

# Build the source list as <numeric-id>\t<source-spec> lines.
# Local working-tree files first.
SOURCES=""
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  bn=$(basename "$f" .md)
  num="${bn#DL-}"
  SOURCES+="$num"$'\t'"local:$f"$'\n'
done < <(find "$RECORDS_DIR" -name 'DL-*.md' -type f 2>/dev/null)

# Then base-only files (skip any whose basename already appears locally).
if [[ -n "$INCLUDE_BASE" ]]; then
  LOCAL_BASENAMES=$(find "$RECORDS_DIR" -name 'DL-*.md' -type f -exec basename {} \; 2>/dev/null | sort -u)
  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    bn=$(basename "$p")
    if grep -qxF "$bn" <<<"$LOCAL_BASENAMES"; then
      continue
    fi
    num=$(echo "$bn" | sed 's/^DL-//;s/\.md$//')
    SOURCES+="$num"$'\t'"base:$p"$'\n'
  done < <(git -C "$PROJECT_ROOT" ls-tree -r --name-only "$INCLUDE_BASE" -- "$RECORDS_DIR_REL" 2>/dev/null | grep -E 'DL-[0-9]+\.md$' || true)
fi

# Strip the trailing newline and sort by numeric ID descending.
SORTED_SOURCES=$(printf '%s' "$SOURCES" | sort -t$'\t' -k1,1 -n -r | cut -f2)

if [[ -z "$SORTED_SOURCES" ]]; then
  {
    echo "# Decision Log"
    echo ""
    if [[ "$MODE" == "namespaced" ]]; then
      echo "| ID | Title | Status | Namespace | Tags |"
      echo "|----|-------|--------|-----------|------|"
    else
      echo "| ID | Title | Status | Tags |"
      echo "|----|-------|--------|------|"
    fi
  } > "$INDEX_FILE"
  echo "INDEX.md regenerated (empty)."
  exit 0
fi

{
  echo "# Decision Log"
  echo ""
  if [[ "$MODE" == "namespaced" ]]; then
    echo "| ID | Title | Status | Namespace | Tags |"
    echo "|----|-------|--------|-----------|------|"
  else
    echo "| ID | Title | Status | Tags |"
    echo "|----|-------|--------|------|"
  fi

  echo "$SORTED_SOURCES" | while IFS= read -r source; do
    [[ -z "$source" ]] && continue
    id=$(extract_field "$source" "id")
    title=$(extract_field "$source" "title")
    status=$(extract_field "$source" "status")
    tags=$(extract_array_field "$source" "tags")

    if [[ "$MODE" == "namespaced" ]]; then
      namespace=$(extract_field "$source" "namespace")
      echo "| $id | $title | $status | $namespace | $tags |"
    else
      echo "| $id | $title | $status | $tags |"
    fi
  done
} > "$INDEX_FILE"

echo "INDEX.md regenerated."
