#!/usr/bin/env bats
# Tests for dld-snapshot/scripts/collect-active-decisions.sh

load 'test_helper/common'

SCRIPT=""

setup() {
  setup_flat_project
  SCRIPT="$SKILLS_DIR/dld-snapshot/scripts/collect-active-decisions.sh"
}

teardown() {
  teardown_project
}

@test "collect-active-decisions outputs nothing with no decisions" {
  run bash "$SCRIPT"
  assert_success
  assert_output ""
}

@test "collect-active-decisions returns only accepted decisions" {
  create_decision "DL-001" "accepted"
  create_decision "DL-002" "proposed"
  create_decision "DL-003" "superseded"
  create_decision "DL-004" "accepted"

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "DL-001"
  assert_output --partial "DL-004"
  refute_output --partial "id: DL-002"
  refute_output --partial "id: DL-003"
}

@test "collect-active-decisions separates with boundary markers" {
  create_decision "DL-001" "accepted"
  create_decision "DL-002" "accepted"

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "===DLD_DECISION_BOUNDARY==="
}

@test "collect-active-decisions has no boundary before first decision" {
  create_decision "DL-001" "accepted"
  create_decision "DL-002" "accepted"

  output="$(bash "$SCRIPT")"
  # First line should be the frontmatter start, not a boundary
  first_line="$(echo "$output" | head -1)"
  assert_equal "$first_line" "---"
}

@test "collect-active-decisions outputs in ascending ID order" {
  create_decision "DL-003" "accepted"
  create_decision "DL-001" "accepted"

  output="$(bash "$SCRIPT")"
  # DL-001 content should appear before DL-003
  pos_001="$(echo "$output" | grep -n "id: DL-001" | head -1 | cut -d: -f1)"
  pos_003="$(echo "$output" | grep -n "id: DL-003" | head -1 | cut -d: -f1)"
  [[ "$pos_001" -lt "$pos_003" ]]
}

@test "collect-active-decisions fails when records dir missing" {
  rmdir decisions/records
  run bash "$SCRIPT"
  assert_failure
  assert_output --partial "records directory not found"
}

@test "collect-active-decisions works with namespaced decisions" {
  setup_namespaced_project
  create_decision "DL-001" "accepted" "billing"
  create_decision "DL-002" "proposed" "auth"
  create_decision "DL-003" "accepted" "auth"

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "id: DL-001"
  assert_output --partial "id: DL-003"
  refute_output --partial "id: DL-002"
}

@test "collect-active-decisions includes full file content" {
  create_decision "DL-001" "accepted"

  run bash "$SCRIPT"
  assert_success
  assert_output --partial "## Context"
  assert_output --partial "## Decision"
  assert_output --partial "Test decision content for DL-001"
}
