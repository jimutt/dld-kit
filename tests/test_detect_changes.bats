#!/usr/bin/env bats
# Tests for dld-snapshot/scripts/detect-snapshot-changes.sh

load 'test_helper/common'

SCRIPT=""
STATE_SCRIPT=""

setup() {
  setup_flat_project
  SCRIPT="$SKILLS_DIR/dld-snapshot/scripts/detect-snapshot-changes.sh"
  STATE_SCRIPT="$SKILLS_DIR/dld-snapshot/scripts/update-snapshot-state.sh"
}

teardown() {
  teardown_project
}

@test "detect-changes returns full when no state file exists" {
  run bash "$SCRIPT"
  assert_success
  assert_output --partial "mode: full"
}

@test "detect-changes returns full when state file has no snapshot section" {
  cat > decisions/.dld-state.yaml <<'YAML'
audit:
  last_run: 2026-01-10T08:00:00Z
  commit_hash: abc1234
YAML

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "mode: full"
}

@test "detect-changes returns full when SNAPSHOT.md is missing" {
  create_decision "DL-001" "accepted"
  bash "$STATE_SCRIPT"
  # SNAPSHOT.md does not exist

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "mode: full"
}

@test "detect-changes returns full when OVERVIEW.md is missing" {
  create_decision "DL-001" "accepted"
  bash "$STATE_SCRIPT"
  touch decisions/SNAPSHOT.md
  # OVERVIEW.md does not exist

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "mode: full"
}

@test "detect-changes returns incremental with no changes" {
  create_decision "DL-001" "accepted"
  bash "$STATE_SCRIPT"
  touch decisions/SNAPSHOT.md
  touch decisions/OVERVIEW.md
  git add -A && git commit -m "snapshot" --quiet

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "mode: incremental"
  assert_output --partial "new_decisions: "
  assert_output --partial "modified_decisions: "
}

@test "detect-changes finds new accepted decisions" {
  create_decision "DL-001" "accepted"
  bash "$STATE_SCRIPT"
  touch decisions/SNAPSHOT.md
  touch decisions/OVERVIEW.md
  git add -A && git commit -m "snapshot" --quiet

  # Add new decisions
  create_decision "DL-002" "accepted"
  create_decision "DL-003" "accepted"
  git add -A && git commit -m "new decisions" --quiet

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "mode: incremental"
  assert_output --partial "DL-002"
  assert_output --partial "DL-003"
}

@test "detect-changes ignores new proposed decisions" {
  create_decision "DL-001" "accepted"
  bash "$STATE_SCRIPT"
  touch decisions/SNAPSHOT.md
  touch decisions/OVERVIEW.md
  git add -A && git commit -m "snapshot" --quiet

  create_decision "DL-002" "proposed"
  git add -A && git commit -m "proposed" --quiet

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "mode: incremental"
  assert_output --partial "new_decisions: "
  # DL-002 should NOT appear in new_decisions
  refute_output --partial "DL-002"
}

@test "detect-changes detects modified decisions via git diff" {
  create_decision "DL-001" "accepted"
  create_decision "DL-002" "accepted"
  bash "$STATE_SCRIPT"
  touch decisions/SNAPSHOT.md
  touch decisions/OVERVIEW.md
  git add -A && git commit -m "snapshot" --quiet

  # Modify DL-001 (e.g., supersede it)
  create_decision "DL-001" "superseded"
  git add -A && git commit -m "supersede DL-001" --quiet

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "mode: incremental"
  assert_output --partial "modified_decisions:"
  assert_output --partial "DL-001"
}

@test "detect-changes does not report new decisions as modified" {
  create_decision "DL-001" "accepted"
  bash "$STATE_SCRIPT"
  touch decisions/SNAPSHOT.md
  touch decisions/OVERVIEW.md
  git add -A && git commit -m "snapshot" --quiet

  # Add DL-002 (new, not modified)
  create_decision "DL-002" "accepted"
  git add -A && git commit -m "new" --quiet

  run bash "$SCRIPT"
  assert_success
  # DL-002 should be in new_decisions, not modified_decisions
  assert_line --partial "new_decisions: DL-002"
  refute_line --regexp "modified_decisions:.*DL-002"
}

@test "detect-changes reports commit range" {
  create_decision "DL-001" "accepted"
  bash "$STATE_SCRIPT"
  touch decisions/SNAPSHOT.md
  touch decisions/OVERVIEW.md
  git add -A && git commit -m "snapshot" --quiet

  create_decision "DL-002" "accepted"
  git add -A && git commit -m "new" --quiet

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "commit_range:"
  # Should contain a .. range
  assert_output --regexp "commit_range: [a-f0-9]+\.\."
}

@test "detect-changes works with old state format (no commit_hash)" {
  create_decision "DL-001" "accepted"
  touch decisions/SNAPSHOT.md
  touch decisions/OVERVIEW.md

  # Write old-format state (no commit_hash)
  cat > decisions/.dld-state.yaml <<'YAML'
snapshot:
  last_run: 2026-01-15T10:00:00Z
  decisions_included: 1
  artifacts:
    SNAPSHOT.md: 2026-01-15T10:00:00Z
    OVERVIEW.md: 2026-01-15T10:00:00Z
YAML

  create_decision "DL-002" "accepted"

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "mode: incremental"
  assert_output --partial "DL-002"
  # No commit range since old state has no commit_hash
  assert_line --partial "commit_range: "
}
