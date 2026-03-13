#!/usr/bin/env bats
# Tests for dld-common/scripts/update-status.sh

load 'test_helper/common'

SCRIPT=""

setup() {
  setup_flat_project
  SCRIPT="$SKILLS_DIR/dld-common/scripts/update-status.sh"
}

teardown() {
  teardown_project
}

@test "update-status changes proposed to accepted" {
  create_decision "DL-001" "proposed"
  run bash "$SCRIPT" DL-001 accepted
  assert_success
  assert_output --partial "Updated DL-001 status to accepted"

  run grep "^status:" decisions/records/DL-001.md
  assert_output "status: accepted"
}

@test "update-status changes accepted to superseded" {
  create_decision "DL-001" "accepted"
  run bash "$SCRIPT" DL-001 superseded
  assert_success

  run grep "^status:" decisions/records/DL-001.md
  assert_output "status: superseded"
}

@test "update-status changes accepted to deprecated" {
  create_decision "DL-001" "accepted"
  run bash "$SCRIPT" DL-001 deprecated
  assert_success

  run grep "^status:" decisions/records/DL-001.md
  assert_output "status: deprecated"
}

@test "update-status rejects invalid status" {
  create_decision "DL-001" "proposed"
  run bash "$SCRIPT" DL-001 invalid
  assert_failure
  assert_output --partial "invalid status"
}

@test "update-status fails for nonexistent decision" {
  run bash "$SCRIPT" DL-999 accepted
  assert_failure
  assert_output --partial "not found"
}

@test "update-status preserves other frontmatter fields" {
  create_decision "DL-001" "proposed"
  bash "$SCRIPT" DL-001 accepted

  run grep "^title:" decisions/records/DL-001.md
  assert_output --partial "Test decision DL-001"
  run grep "^tags:" decisions/records/DL-001.md
  assert_output --partial "[test, example]"
}

@test "update-status preserves body content" {
  create_decision "DL-001" "proposed"
  bash "$SCRIPT" DL-001 accepted

  run grep "Test context for DL-001" decisions/records/DL-001.md
  assert_success
}

@test "update-status only modifies status in frontmatter, not body" {
  # Create a decision that mentions "status:" in the body
  cat > decisions/records/DL-001.md <<'EOF'
---
id: DL-001
title: "Test"
timestamp: 2026-01-15T10:00:00Z
status: proposed
tags: []
references: []
---

## Context
The status: field in YAML is important.
EOF

  bash "$SCRIPT" DL-001 accepted

  # Frontmatter status should be updated
  run sed -n '/^---$/,/^---$/p' decisions/records/DL-001.md
  assert_output --partial "status: accepted"

  # Body text should be preserved unchanged
  run grep "The status: field in YAML is important." decisions/records/DL-001.md
  assert_success
}

@test "update-status finds decision in namespace subdirectory" {
  setup_namespaced_project
  create_decision "DL-001" "proposed" "billing"
  run bash "$SCRIPT" DL-001 accepted
  assert_success

  run grep "^status:" decisions/records/billing/DL-001.md
  assert_output "status: accepted"
}

@test "update-status requires both arguments" {
  run bash "$SCRIPT"
  assert_failure
}
