#!/usr/bin/env bash
# Create a goal run: scaffolds .dld/runs/<slug>/ with contract.md, state.json,
# and events.jsonl, and ensures run artifacts are gitignored.
#
# @decision(DL-001)
#
# Usage: create-run.sh --slug <slug> --title <title>
#          [--max-items N] [--max-minutes N] [--review enabled|disabled]
#          [--body-stdin]
#
# --body-stdin reads the contract objective (markdown) from stdin.
# Prints the run directory on success.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

require_jq

SLUG=""
TITLE=""
MAX_ITEMS=0
MAX_MINUTES=0
REVIEW="enabled"
BODY=""
READ_STDIN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug) SLUG="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --max-items) MAX_ITEMS="$2"; shift 2 ;;
    --max-minutes) MAX_MINUTES="$2"; shift 2 ;;
    --review) REVIEW="$2"; shift 2 ;;
    --body-stdin) READ_STDIN=true; shift ;;
    *) if [[ "$1" != -* ]]; then
         usage
       else
         echo "Unknown option: $1" >&2
         usage
       fi
       exit 1 ;;
  esac
done

if [[ -z "$SLUG" || -z "$TITLE" ]]; then
  echo "Error: --slug and --title are required." >&2
  exit 1
fi

validate_slug "$SLUG"

case "$REVIEW" in
  enabled|disabled) ;;
  *) echo "Error: --review must be 'enabled' or 'disabled', got '$REVIEW'." >&2; exit 1 ;;
esac

for numeric in "$MAX_ITEMS" "$MAX_MINUTES"; do
  if [[ ! "$numeric" =~ ^[0-9]+$ ]]; then
    echo "Error: bounds must be non-negative integers, got '$numeric'." >&2
    exit 1
  fi
done

if [[ "$READ_STDIN" == true ]]; then
  BODY="$(cat)"
fi

ROOT="$(get_project_root)"
RUN_DIR="$(get_run_dir "$SLUG")"

if [[ -d "$RUN_DIR" ]]; then
  echo "Error: run '$SLUG' already exists at $RUN_DIR." >&2
  exit 1
fi

TIMESTAMP="$(utc_timestamp)"

mkdir -p "$RUN_DIR"

# state.json — machine-readable run state. Items are added by the item scripts.
jq -n \
  --arg slug "$SLUG" \
  --arg title "$TITLE" \
  --arg createdAt "$TIMESTAMP" \
  --argjson maxItems "$MAX_ITEMS" \
  --argjson maxMinutes "$MAX_MINUTES" \
  --arg review "$REVIEW" \
  '{
    schemaVersion: 1,
    slug: $slug,
    title: $title,
    status: "active",
    createdAt: $createdAt,
    updatedAt: $createdAt,
    bounds: { maxItems: $maxItems, maxMinutes: $maxMinutes },
    review: $review,
    currentItem: null,
    items: [],
    blockedQuestions: []
  }' > "$RUN_DIR/state.json"

# contract.md — human-readable objective, immutable for the life of the run.
{
  echo "# Goal run: $TITLE"
  echo ""
  echo "- **Run:** \`$SLUG\`"
  echo "- **Created:** $TIMESTAMP"
  if [[ "$MAX_ITEMS" -gt 0 ]]; then
    echo "- **Max items:** $MAX_ITEMS"
  fi
  if [[ "$MAX_MINUTES" -gt 0 ]]; then
    echo "- **Max minutes:** $MAX_MINUTES"
  fi
  echo "- **Review step:** $REVIEW"
  echo ""
  echo "## Objective"
  echo ""
  if [[ -n "$BODY" ]]; then
    echo "$BODY"
  else
    echo "_No objective recorded._"
  fi
  echo ""
  echo "## Scope"
  echo ""
  echo "Work items and their decisions are tracked in \`state.json\`. This contract is immutable for the life of the run — replan by starting a new run."
} > "$RUN_DIR/contract.md"

: > "$RUN_DIR/events.jsonl"

# Run artifacts are local working state unless the project opts out.
ARTIFACTS="$(config_get_optional goal_run_artifacts gitignore)"
if [[ "$ARTIFACTS" != "commit" ]]; then
  GITIGNORE="$ROOT/.gitignore"
  if [[ ! -f "$GITIGNORE" ]] || ! grep -qxF ".dld/" "$GITIGNORE"; then
    if [[ -f "$GITIGNORE" && -s "$GITIGNORE" && -n "$(tail -c 1 "$GITIGNORE")" ]]; then
      echo "" >> "$GITIGNORE"
    fi
    echo ".dld/" >> "$GITIGNORE"
  fi
fi

bash "$SCRIPT_DIR/append-event.sh" "$SLUG" run-created \
  --data "$(jq -n --arg title "$TITLE" '{title: $title}')"

echo "$RUN_DIR"
