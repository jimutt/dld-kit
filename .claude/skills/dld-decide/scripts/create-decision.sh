#!/usr/bin/env bash
# Create a decision record file.
# Usage: create-decision.sh --id <DL-NNN> --title <title> [--namespace <ns>] [--tags <t1,t2>] [--supersedes <DL-X,DL-Y>] [--amends <DL-X,DL-Y>] [--body-stdin]
# All flags except --id and --title are optional.
# --body-stdin reads the markdown body (Context, Decision, Rationale, Consequences sections) from stdin.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../dld-common/scripts/common.sh"

ID=""
TITLE=""
NAMESPACE=""
TAGS=""
SUPERSEDES=""
AMENDS=""
BODY=""
READ_STDIN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id) ID="$2"; shift 2 ;;
    --title) TITLE="$2"; shift 2 ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    --tags) TAGS="$2"; shift 2 ;;
    --supersedes) SUPERSEDES="$2"; shift 2 ;;
    --amends) AMENDS="$2"; shift 2 ;;
    --body-stdin) READ_STDIN=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ "$READ_STDIN" == true ]]; then
  BODY="$(cat)"
fi

if [[ -z "$ID" || -z "$TITLE" ]]; then
  echo "Error: --id and --title are required." >&2
  exit 1
fi

RECORDS_DIR="$(get_records_dir)"
MODE="$(get_mode)"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Determine output path
if [[ "$MODE" == "namespaced" && -n "$NAMESPACE" ]]; then
  OUTPUT_DIR="$RECORDS_DIR/$NAMESPACE"
  mkdir -p "$OUTPUT_DIR"
else
  OUTPUT_DIR="$RECORDS_DIR"
  mkdir -p "$OUTPUT_DIR"
fi

OUTPUT_FILE="$OUTPUT_DIR/$ID.md"

if [[ -f "$OUTPUT_FILE" ]]; then
  echo "Error: $OUTPUT_FILE already exists." >&2
  exit 1
fi

# Format tags as YAML inline array
format_tags() {
  if [[ -z "$1" ]]; then
    echo "[]"
  else
    echo "[$1]"
  fi
}

# Format supersedes as YAML inline array
format_supersedes() {
  if [[ -z "$1" ]]; then
    echo "[]"
  else
    echo "[$1]"
  fi
}

# Format amends as YAML inline array
format_amends() {
  if [[ -z "$1" ]]; then
    echo "[]"
  else
    echo "[$1]"
  fi
}

{
  echo "---"
  echo "id: $ID"
  echo "title: \"$TITLE\""
  echo "timestamp: $TIMESTAMP"
  echo "status: proposed"
  echo "supersedes: $(format_supersedes "$SUPERSEDES")"
  echo "amends: $(format_amends "$AMENDS")"
  if [[ "$MODE" == "namespaced" && -n "$NAMESPACE" ]]; then
    echo "namespace: $NAMESPACE"
  fi
  echo "tags: $(format_tags "$TAGS")"
  echo "references: []"
  echo "---"
  echo ""
  if [[ -n "$BODY" ]]; then
    echo "$BODY"
  fi
} > "$OUTPUT_FILE"

echo "$OUTPUT_FILE"
