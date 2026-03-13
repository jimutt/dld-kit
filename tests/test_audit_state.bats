#!/usr/bin/env bats
# Tests for dld-audit/scripts/update-audit-state.sh

load 'test_helper/common'

SCRIPT=""

setup() {
  setup_flat_project
  SCRIPT="$SKILLS_DIR/dld-audit/scripts/update-audit-state.sh"
}

teardown() {
  teardown_project
}

@test "update-audit-state creates state file" {
  run bash "$SCRIPT"
  assert_success

  [[ -f decisions/.dld-state.yaml ]]
  run cat decisions/.dld-state.yaml
  assert_output --partial "audit:"
  assert_output --partial "last_run:"
  assert_output --partial "commit_hash:"
}

@test "update-audit-state records git commit hash" {
  bash "$SCRIPT"
  hash="$(git rev-parse --short HEAD)"

  run cat decisions/.dld-state.yaml
  assert_output --partial "commit_hash: $hash"
}

@test "update-audit-state preserves snapshot section" {
  cat > decisions/.dld-state.yaml <<'YAML'
snapshot:
  last_run: 2026-01-10T08:00:00Z
  decisions_included: 5
  artifacts:
    SNAPSHOT.md: 2026-01-10T08:00:00Z
    OVERVIEW.md: 2026-01-10T08:00:00Z
YAML

  bash "$SCRIPT"
  run cat decisions/.dld-state.yaml
  assert_output --partial "snapshot:"
  assert_output --partial "decisions_included: 5"
  assert_output --partial "audit:"
}

@test "update-audit-state replaces existing audit section" {
  cat > decisions/.dld-state.yaml <<'YAML'
audit:
  last_run: 2026-01-01T00:00:00Z
  commit_hash: old1234
YAML

  bash "$SCRIPT"
  run cat decisions/.dld-state.yaml
  refute_output --partial "old1234"
  assert_output --partial "audit:"
}
