#!/usr/bin/env bash
# Find decisions that reference other decision IDs in their body
# but don't list them in supersedes or amends.
# Output: one line per candidate in the format: <source-id>:<referenced-id>
# Outputs nothing (exit 0) if no candidates found.
# These are candidates — the agent must evaluate whether the reference
# is actually a partial modification or just informational.
#
# By default, only emits candidates whose source decision file changed
# since the last recorded audit (audit.commit_hash in .dld-state.yaml).
# This avoids re-flagging references the agent already evaluated and
# decided were informational. Pass --all to ignore the audit state and
# scan every decision (use for cold starts or manual deep audits).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

ALL=false
if [[ "${1:-}" == "--all" ]]; then
  ALL=true
fi

DECISIONS_DIR="$(get_decisions_dir)"
RECORDS_DIR="$(get_records_dir)"
PROJECT_ROOT="$(get_project_root)"
STATE_FILE="$DECISIONS_DIR/.dld-state.yaml"

# Determine the set of decision files changed since the last audit.
# Empty CHANGED_SET means "no filtering" (cold start or --all).
CHANGED_SET=""
if ! $ALL && [[ -f "$STATE_FILE" ]]; then
  # Extract commit_hash from the audit: block. Simple grep — the block
  # is written by update-audit-state.sh with two-space indentation.
  AUDIT_COMMIT=$(awk '
    /^audit:/ { in_audit=1; next }
    in_audit && /^[^[:space:]]/ { in_audit=0 }
    in_audit && /^[[:space:]]+commit_hash:/ {
      sub(/^[[:space:]]+commit_hash:[[:space:]]*/, "")
      gsub(/^["'\'']|["'\'']$/, "")
      print
      exit
    }
  ' "$STATE_FILE")

  if [[ -n "$AUDIT_COMMIT" && "$AUDIT_COMMIT" != "unknown" ]]; then
    # Verify the commit exists in this repo (it might not after a rebase
    # or shallow clone — fall back to scanning everything).
    if git -C "$PROJECT_ROOT" rev-parse --verify --quiet "$AUDIT_COMMIT^{commit}" >/dev/null; then
      # Files changed (committed + working tree) since the audit commit,
      # plus untracked files (new decisions not yet committed).
      CHANGED_SET=$(
        {
          git -C "$PROJECT_ROOT" diff --name-only "$AUDIT_COMMIT" -- "$RECORDS_DIR" 2>/dev/null || true
          git -C "$PROJECT_ROOT" ls-files --others --exclude-standard -- "$RECORDS_DIR" 2>/dev/null || true
        } | sort -u
      )
      # Sentinel: if nothing changed, set to a single newline so the
      # membership check below has something to grep against and finds nothing.
      if [[ -z "$CHANGED_SET" ]]; then
        CHANGED_SET=$'\n'
      fi
    fi
  fi
fi

# Find all decision files
shopt -s nullglob
files=("$RECORDS_DIR"/DL-*.md "$RECORDS_DIR"/*/DL-*.md)
shopt -u nullglob

if [[ ${#files[@]} -eq 0 ]]; then
  exit 0
fi

for file in "${files[@]}"; do
  id=$(basename "$file" .md)

  # Skip if filtering by changed set and this file isn't in it.
  if [[ -n "$CHANGED_SET" ]]; then
    rel="${file#"$PROJECT_ROOT"/}"
    if ! grep -qxF "$rel" <<<"$CHANGED_SET"; then
      continue
    fi
  fi

  # Extract supersedes and amends from frontmatter (between --- markers)
  frontmatter=$(sed -n '1,/^---$/{ /^---$/d; p; }; /^---$/,/^---$/{ /^---$/d; p; }' "$file" | head -50)
  declared=$(echo "$frontmatter" | grep -E '^(supersedes|amends):' | grep -oE 'DL-[0-9]+' || true)

  # Extract body (everything after the second ---)
  body=$(awk 'BEGIN{n=0} /^---$/{n++; next} n>=2{print}' "$file")

  # Find DL-IDs referenced in the body
  body_refs=$(echo "$body" | grep -oE 'DL-[0-9]+' | sort -u || true)

  if [[ -z "$body_refs" ]]; then
    continue
  fi

  for ref in $body_refs; do
    # Skip self-references
    if [[ "$ref" == "$id" ]]; then
      continue
    fi

    # Skip if already declared in supersedes or amends
    if echo "$declared" | grep -qF "$ref" 2>/dev/null; then
      continue
    fi

    echo "$id:$ref"
  done
done
