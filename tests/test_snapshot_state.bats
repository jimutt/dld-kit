#!/usr/bin/env bats
# Tests for dld-snapshot/scripts/update-snapshot-state.sh

load 'test_helper/common'

SCRIPT=""

setup() {
  setup_flat_project
  SCRIPT="$SKILLS_DIR/dld-snapshot/scripts/update-snapshot-state.sh"
}

teardown() {
  teardown_project
}

@test "update-snapshot-state creates state file" {
  create_decision "DL-001" "accepted"
  run bash "$SCRIPT"
  assert_success

  [[ -f decisions/.dld-state.yaml ]]
  run cat decisions/.dld-state.yaml
  assert_output --partial "snapshot:"
  assert_output --partial "last_run:"
  assert_output --partial "decisions_included: 1"
}

@test "update-snapshot-state tracks highest accepted ID" {
  create_decision "DL-001" "accepted"
  create_decision "DL-002" "proposed"
  create_decision "DL-003" "accepted"

  bash "$SCRIPT"
  run cat decisions/.dld-state.yaml
  assert_output --partial "decisions_included: 3"
}

@test "update-snapshot-state ignores non-accepted decisions for highest" {
  create_decision "DL-001" "accepted"
  create_decision "DL-005" "proposed"

  bash "$SCRIPT"
  run cat decisions/.dld-state.yaml
  assert_output --partial "decisions_included: 1"
}

@test "update-snapshot-state includes built-in artifact timestamps" {
  create_decision "DL-001" "accepted"
  bash "$SCRIPT"

  run cat decisions/.dld-state.yaml
  assert_output --partial "SNAPSHOT.md:"
  assert_output --partial "OVERVIEW.md:"
}

@test "update-snapshot-state includes custom artifact timestamps" {
  create_decision "DL-001" "accepted"
  bash "$SCRIPT" ONBOARDING.md API-CONTRACTS.md

  run cat decisions/.dld-state.yaml
  assert_output --partial "SNAPSHOT.md:"
  assert_output --partial "OVERVIEW.md:"
  assert_output --partial "ONBOARDING.md:"
  assert_output --partial "API-CONTRACTS.md:"
}

@test "update-snapshot-state preserves audit section" {
  create_decision "DL-001" "accepted"

  # Create existing state file with audit section
  cat > decisions/.dld-state.yaml <<'YAML'
audit:
  last_run: 2026-01-10T08:00:00Z
  commit_hash: abc1234
YAML

  bash "$SCRIPT"
  run cat decisions/.dld-state.yaml
  assert_output --partial "audit:"
  assert_output --partial "commit_hash: abc1234"
  assert_output --partial "snapshot:"
}

@test "update-snapshot-state replaces existing snapshot section" {
  create_decision "DL-001" "accepted"

  cat > decisions/.dld-state.yaml <<'YAML'
snapshot:
  last_run: 2026-01-01T00:00:00Z
  decisions_included: 0
  artifacts:
    SNAPSHOT.md: 2026-01-01T00:00:00Z
    OVERVIEW.md: 2026-01-01T00:00:00Z
YAML

  bash "$SCRIPT"
  run cat decisions/.dld-state.yaml
  # Old timestamp should be gone
  refute_output --partial "2026-01-01T00:00:00Z"
  assert_output --partial "decisions_included: 1"
}

@test "update-snapshot-state handles zero accepted decisions" {
  create_decision "DL-001" "proposed"
  bash "$SCRIPT"

  run cat decisions/.dld-state.yaml
  assert_output --partial "decisions_included: 0"
}
