#!/usr/bin/env bats
# Tests for dld-snapshot/scripts/collect-proposed-decisions.sh

load 'test_helper/common'

SCRIPT=""

setup() {
  setup_flat_project
  SCRIPT="$SKILLS_DIR/dld-snapshot/scripts/collect-proposed-decisions.sh"
}

teardown() {
  teardown_project
}

@test "collect-proposed-decisions outputs nothing with no decisions" {
  run bash "$SCRIPT"
  assert_success
  assert_output ""
}

@test "collect-proposed-decisions returns only proposed decisions" {
  create_decision "DL-001" "accepted"
  create_decision "DL-002" "proposed"
  create_decision "DL-003" "superseded"
  create_decision "DL-004" "proposed"

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "id: DL-002"
  assert_output --partial "id: DL-004"
  refute_output --partial "id: DL-001"
  refute_output --partial "id: DL-003"
}

@test "collect-proposed-decisions separates with boundary markers" {
  create_decision "DL-001" "proposed"
  create_decision "DL-002" "proposed"

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "===DLD_DECISION_BOUNDARY==="
}

@test "collect-proposed-decisions has no boundary before first decision" {
  create_decision "DL-001" "proposed"
  create_decision "DL-002" "proposed"

  output="$(bash "$SCRIPT")"
  first_line="$(echo "$output" | head -1)"
  assert_equal "$first_line" "---"
}

@test "collect-proposed-decisions outputs in ascending ID order" {
  create_decision "DL-003" "proposed"
  create_decision "DL-001" "proposed"

  output="$(bash "$SCRIPT")"
  pos_001="$(echo "$output" | grep -n "id: DL-001" | head -1 | cut -d: -f1)"
  pos_003="$(echo "$output" | grep -n "id: DL-003" | head -1 | cut -d: -f1)"
  [[ "$pos_001" -lt "$pos_003" ]]
}

@test "collect-proposed-decisions exits cleanly when records dir missing" {
  rmdir decisions/records
  run bash "$SCRIPT"
  assert_success
  assert_output ""
}

@test "collect-proposed-decisions works with namespaced decisions" {
  setup_namespaced_project
  create_decision "DL-001" "proposed" "billing"
  create_decision "DL-002" "accepted" "auth"
  create_decision "DL-003" "proposed" "auth"

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "id: DL-001"
  assert_output --partial "id: DL-003"
  refute_output --partial "id: DL-002"
}

@test "collect-proposed-decisions includes full file content" {
  create_decision "DL-001" "proposed"

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "## Context"
  assert_output --partial "## Decision"
  assert_output --partial "Test decision content for DL-001"
}
