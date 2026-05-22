#!/usr/bin/env bash
# Apply (or remove) dld-kit-pi harness-aware additions to a project's
# .claude/skills/ directory.
#
# Usage:
#   apply.sh <path-to-.claude/skills>           # apply all additions
#   apply.sh --remove <path-to-.claude/skills>  # strip all additions
#   apply.sh --dry-run <path-to-.claude/skills> # show what would change, no writes
#
# Each addition file in additions/ starts with an HTML-comment directive:
#
#   <!-- DLDKITPI: target=dld-plan, anchor="## Script Paths", position=before -->
#
# Inserted blocks are wrapped in fences:
#
#   <!-- BEGIN: dld-kit-pi:<filename-without-.md> -->
#   ...body...
#   <!-- END: dld-kit-pi:<filename-without-.md> -->
#
# Re-runs replace content between matching fences in place (idempotent).
# --remove strips the fenced blocks.

set -euo pipefail

REMOVE=false
DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --remove) REMOVE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) break ;;
  esac
done

TARGET_SKILLS_DIR="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADDITIONS_DIR="$SCRIPT_DIR/additions"

if [[ -z "$TARGET_SKILLS_DIR" ]]; then
  echo "Usage: $(basename "$0") [--remove|--dry-run] <path-to-.claude/skills>" >&2
  exit 1
fi
if [[ ! -d "$TARGET_SKILLS_DIR" ]]; then
  echo "Error: $TARGET_SKILLS_DIR is not a directory" >&2
  exit 1
fi
if [[ ! -d "$ADDITIONS_DIR" ]]; then
  echo "Error: additions dir not found at $ADDITIONS_DIR" >&2
  exit 1
fi

# Parse the DLDKITPI: directive on line 1 of an addition file.
# Sets globals: TARGET_NAME, ANCHOR, POSITION.
# Returns non-zero if the directive is missing or malformed.
parse_directive() {
  local file="$1" header
  header="$(head -n 1 "$file")"
  if [[ "$header" =~ DLDKITPI:[[:space:]]+target=([a-z-]+),[[:space:]]+anchor=\"([^\"]+)\",[[:space:]]+position=(before|after) ]]; then
    TARGET_NAME="${BASH_REMATCH[1]}"
    ANCHOR="${BASH_REMATCH[2]}"
    POSITION="${BASH_REMATCH[3]}"
    return 0
  fi
  return 1
}

# Process one addition file against its target SKILL.md.
apply_one() {
  local addition="$1"
  local fence="$(basename "$addition" .md)"
  local begin="<!-- BEGIN: dld-kit-pi:${fence} -->"
  local end="<!-- END: dld-kit-pi:${fence} -->"

  if ! parse_directive "$addition"; then
    echo "  skip: $addition has no valid DLDKITPI directive" >&2
    return
  fi

  local target="$TARGET_SKILLS_DIR/$TARGET_NAME/SKILL.md"
  if [[ ! -f "$target" ]]; then
    echo "  skip: $target not found"
    return
  fi

  local has_block=false
  grep -qF "$begin" "$target" && has_block=true

  if $REMOVE; then
    if ! $has_block; then
      echo "  no-op: $fence not present in $target"
      return
    fi
    local begin_line end_line
    begin_line=$(grep -nF "$begin" "$target" | head -n1 | cut -d: -f1)
    end_line=$(grep -nF "$end" "$target" | head -n1 | cut -d: -f1)
    # Expand range to also strip the padding blank line that apply
    # inserts (after END for position=before, before BEGIN for
    # position=after) so apply→remove is a clean round trip.
    local before_begin after_end
    before_begin=$(sed -n "$((begin_line - 1))p" "$target")
    after_end=$(sed -n "$((end_line + 1))p" "$target")
    local strip_begin=$begin_line strip_end=$end_line
    [[ -z "$after_end" ]] && strip_end=$((end_line + 1))
    [[ -z "$before_begin" && "$strip_end" == "$end_line" ]] && strip_begin=$((begin_line - 1))
    if $DRY_RUN; then
      echo "  would remove: $fence from $target (lines $strip_begin-$strip_end)"
      return
    fi
    {
      head -n $((strip_begin - 1)) "$target"
      tail -n +$((strip_end + 1)) "$target"
    } > "$target.tmp"
    mv "$target.tmp" "$target"
    echo "  removed: $fence from $target"
    return
  fi

  # --- apply path ---
  # Body = addition file with the directive line stripped, AND with a
  # leading blank line trimmed if present (the file's first line after
  # the directive is conventionally blank for readability in the source).
  local body
  body="$(tail -n +2 "$addition" | sed '1{/^$/d;}')"

  if $has_block; then
    local begin_line end_line
    begin_line=$(grep -nF "$begin" "$target" | head -n1 | cut -d: -f1)
    end_line=$(grep -nF "$end" "$target" | head -n1 | cut -d: -f1)
    if $DRY_RUN; then
      echo "  would update: $fence in $target (lines $begin_line-$end_line)"
      return
    fi
    {
      head -n "$begin_line" "$target"
      printf '%s\n' "$body"
      tail -n +"$end_line" "$target"
    } > "$target.tmp"
    mv "$target.tmp" "$target"
    echo "  updated: $fence in $target"
    return
  fi

  # Insert at anchor.
  local anchor_line
  anchor_line=$(grep -nFx "$ANCHOR" "$target" | head -n1 | cut -d: -f1 || true)
  if [[ -z "$anchor_line" ]]; then
    echo "  skip: anchor '$ANCHOR' not found in $target" >&2
    return
  fi

  if $DRY_RUN; then
    echo "  would insert: $fence into $target ($POSITION line $anchor_line: '$ANCHOR')"
    return
  fi

  if [[ "$POSITION" == "before" ]]; then
    {
      head -n $((anchor_line - 1)) "$target"
      printf '%s\n' "$begin"
      printf '%s\n' "$body"
      printf '%s\n\n' "$end"
      tail -n +"$anchor_line" "$target"
    } > "$target.tmp"
  else
    {
      head -n "$anchor_line" "$target"
      printf '\n%s\n' "$begin"
      printf '%s\n' "$body"
      printf '%s\n' "$end"
      tail -n +$((anchor_line + 1)) "$target"
    } > "$target.tmp"
  fi
  mv "$target.tmp" "$target"
  echo "  inserted: $fence into $target"
}

mode_label="apply"
$REMOVE && mode_label="remove"
$DRY_RUN && mode_label="$mode_label (dry-run)"

echo "dld-kit-pi skill additions — $mode_label"
echo "  target: $TARGET_SKILLS_DIR"
echo "  source: $ADDITIONS_DIR"

shopt -s nullglob
for addition in "$ADDITIONS_DIR"/*.md; do
  apply_one "$addition"
done

echo "done."
