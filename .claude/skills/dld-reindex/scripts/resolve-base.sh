#!/usr/bin/env bash
# Resolve the base ref for /dld-reindex.
#
# Prefers the branch's upstream when it tracks a DIFFERENT branch name
# (the typical "feature → main" setup). Falls back to origin/main when:
#   * No upstream is configured.
#   * Upstream tracks a branch with the same name as the current branch
#     (e.g. current=test/dld-reindex-dummy, upstream=origin/test/dld-reindex-dummy
#      — that's the remote copy of the same branch, not a useful collision base).
#
# Outputs the resolved ref. Exits non-zero only if it can't resolve anything.

set -euo pipefail

CURRENT=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

UPSTREAM=""
if UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}" 2>/dev/null); then
  UPSTREAM_BRANCH="${UPSTREAM#*/}"
  if [[ -n "$UPSTREAM_BRANCH" && "$UPSTREAM_BRANCH" != "$CURRENT" ]]; then
    echo "$UPSTREAM"
    exit 0
  fi
fi

echo "origin/main"
