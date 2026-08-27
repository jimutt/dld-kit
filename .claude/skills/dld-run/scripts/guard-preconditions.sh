#!/usr/bin/env bash
# Check that it is safe to start or resume a goal run.
#
# @decision(DL-004)
#
# Usage:
#   guard-preconditions.sh start --decisions <DL-A,DL-B> [--base <ref>]
#   guard-preconditions.sh resume <slug> [--base <ref>]
#
# Prints one line per problem and exits 1. Silent with exit 0 when safe.
#
# A run holds decision IDs and pinned hashes, so anything that renames or
# rewrites decisions underneath it — an unresolved ID collision above all —
# invalidates the run wholesale. The resolution is always /dld-reindex first.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

require_jq

MODE="${1:-}"
shift || true

case "$MODE" in
  start|resume) ;;
  *) echo "Usage: guard-preconditions.sh <start|resume> [...]" >&2; exit 1 ;;
esac

SLUG=""
DECISIONS=""
BASE=""

if [[ "$MODE" == "resume" ]]; then
  SLUG="${1:?Usage: guard-preconditions.sh resume <slug> [--base <ref>]}"
  shift
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --decisions) DECISIONS="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

PROBLEMS=0

report() {
  echo "$1"
  PROBLEMS=1
}

ROOT="$(get_project_root)"

# --- config ---

if [[ ! -f "$ROOT/dld.config.yaml" ]]; then
  echo "dld.config.yaml not found — run /dld-init first"
  exit 1
fi

# --- working tree ---

if [[ -n "$(git -C "$ROOT" status --porcelain)" ]]; then
  report "working tree is dirty — commit or stash before running a goal"
fi

# --- decision ID collisions with the base branch ---
# Skipped when no usable base exists (no remote, fresh repo): a collision check
# against nothing would be noise, not safety.

if [[ -z "$BASE" ]]; then
  BASE="$(bash "$SCRIPT_DIR/../../dld-reindex/scripts/resolve-base.sh" 2>/dev/null || echo "")"
fi

if [[ -n "$BASE" ]] && git -C "$ROOT" rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
  COLLISIONS="$(bash "$SCRIPT_DIR/../../dld-reindex/scripts/find-collisions.sh" --base "$BASE" 2>/dev/null || true)"
  if [[ -n "$COLLISIONS" ]]; then
    while IFS=$'\t' read -r path id; do
      [[ -z "$id" ]] && continue
      report "decision ID collision with $BASE: $id ($path) — run /dld-reindex first"
    done <<< "$COLLISIONS"
  fi
fi

# --- mode-specific checks ---

if [[ "$MODE" == "start" ]]; then
  ACTIVE="$(bash "$SCRIPT_DIR/run-state.sh" active || true)"
  if [[ -n "$ACTIVE" ]]; then
    while IFS= read -r slug; do
      [[ -z "$slug" ]] && continue
      report "run '$slug' is already active — pause or stop it before starting another"
    done <<< "$ACTIVE"
  fi

  if [[ -z "$DECISIONS" ]]; then
    echo "Error: --decisions is required for start." >&2
    exit 1
  fi

  IFS=',' read -ra __ids <<< "$DECISIONS"
  for raw_id in "${__ids[@]}"; do
    id="$(printf '%s' "$raw_id" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ -z "$id" ]] && continue

    if ! file="$(find_decision_file "$id" 2>/dev/null)"; then
      report "$id does not exist in the decision log"
      continue
    fi

    status="$(awk 'BEGIN{c=0} /^---$/{c++; next} c==1 && /^status:/{sub(/^status:[[:space:]]*/, ""); print; exit}' "$file")"
    if [[ "$status" != "proposed" ]]; then
      report "$id is '$status', not 'proposed' — a run implements proposed decisions"
    fi
  done
fi

if [[ "$MODE" == "resume" ]]; then
  validate_slug "$SLUG"
  STATE_FILE="$(get_run_dir "$SLUG")/state.json"

  if [[ ! -f "$STATE_FILE" ]]; then
    echo "run '$SLUG' not found"
    exit 1
  fi

  RUN_STATUS="$(jq -r '.status' "$STATE_FILE")"
  case "$RUN_STATUS" in
    paused|blocked|active) ;;
    complete|stopped) report "run '$SLUG' is '$RUN_STATUS' and cannot be resumed — start a new run" ;;
    *) report "run '$SLUG' has an unrecognised status '$RUN_STATUS'" ;;
  esac

  # Decisions may have moved while the run was idle.
  if ! DRIFT="$(bash "$SCRIPT_DIR/verify-hashes.sh" "$SLUG" --all)"; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      report "$line — replan rather than implementing against changed intent"
    done <<< "$DRIFT"
  fi
fi

exit "$PROBLEMS"
