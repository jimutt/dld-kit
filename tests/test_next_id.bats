#!/usr/bin/env bats
# Tests for dld-common/scripts/next-id.sh

load 'test_helper/common'

setup() {
  setup_flat_project
}

teardown() {
  teardown_project
}

@test "next-id returns DL-001 with no existing decisions" {
  run bash "$SKILLS_DIR/dld-common/scripts/next-id.sh"
  assert_success
  assert_output "DL-001"
}

@test "next-id returns DL-001 when records dir missing" {
  rmdir decisions/records
  run bash "$SKILLS_DIR/dld-common/scripts/next-id.sh"
  assert_success
  assert_output "DL-001"
}

@test "next-id increments from existing decisions" {
  create_decision "DL-001" "accepted"
  create_decision "DL-002" "proposed"
  run bash "$SKILLS_DIR/dld-common/scripts/next-id.sh"
  assert_success
  assert_output "DL-003"
}

@test "next-id handles gaps in IDs" {
  create_decision "DL-001" "accepted"
  create_decision "DL-005" "accepted"
  run bash "$SKILLS_DIR/dld-common/scripts/next-id.sh"
  assert_success
  assert_output "DL-006"
}

@test "next-id handles octal-safe numbers (DL-008, DL-009)" {
  create_decision "DL-008" "accepted"
  create_decision "DL-009" "accepted"
  run bash "$SKILLS_DIR/dld-common/scripts/next-id.sh"
  assert_success
  assert_output "DL-010"
}

@test "next-id works with namespaced decisions" {
  setup_namespaced_project
  create_decision "DL-001" "accepted" "billing"
  create_decision "DL-003" "accepted" "auth"
  run bash "$SKILLS_DIR/dld-common/scripts/next-id.sh"
  assert_success
  assert_output "DL-004"
}

@test "next-id ignores non-decision files" {
  create_decision "DL-002" "accepted"
  touch decisions/records/README.md
  touch decisions/records/notes.txt
  run bash "$SKILLS_DIR/dld-common/scripts/next-id.sh"
  assert_success
  assert_output "DL-003"
}
