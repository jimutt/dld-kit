#!/usr/bin/env bats
# Tests for dld-decide/scripts/create-decision.sh

load 'test_helper/common'

SCRIPT=""

setup() {
  setup_flat_project
  SCRIPT="$SKILLS_DIR/dld-decide/scripts/create-decision.sh"
}

teardown() {
  teardown_project
}

@test "create-decision creates file with correct frontmatter" {
  run bash "$SCRIPT" --id DL-001 --title "Test decision"
  assert_success
  assert_output --partial "DL-001.md"

  # Verify file exists and has correct structure
  [[ -f decisions/records/DL-001.md ]]
  run cat decisions/records/DL-001.md
  assert_output --partial 'id: DL-001'
  assert_output --partial 'title: "Test decision"'
  assert_output --partial 'status: proposed'
  assert_output --partial 'supersedes: []'
  assert_output --partial 'amends: []'
  assert_output --partial 'tags: []'
  assert_output --partial 'references: []'
}

@test "create-decision includes tags" {
  run bash "$SCRIPT" --id DL-001 --title "Tagged" --tags "api, auth"
  assert_success

  run cat decisions/records/DL-001.md
  assert_output --partial 'tags: [api, auth]'
}

@test "create-decision includes supersedes" {
  run bash "$SCRIPT" --id DL-002 --title "Superseder" --supersedes "DL-001"
  assert_success

  run cat decisions/records/DL-002.md
  assert_output --partial 'supersedes: [DL-001]'
}

@test "create-decision includes amends" {
  run bash "$SCRIPT" --id DL-002 --title "Amender" --amends "DL-001"
  assert_success

  run cat decisions/records/DL-002.md
  assert_output --partial 'amends: [DL-001]'
}

@test "create-decision reads body from stdin" {
  echo "## Context
Some context here.

## Decision
We decided this." | bash "$SCRIPT" --id DL-001 --title "With body" --body-stdin

  run cat decisions/records/DL-001.md
  assert_output --partial "Some context here."
  assert_output --partial "We decided this."
}

@test "create-decision fails without --id" {
  run bash "$SCRIPT" --title "No ID"
  assert_failure
  assert_output --partial "required"
}

@test "create-decision fails without --title" {
  run bash "$SCRIPT" --id DL-001
  assert_failure
  assert_output --partial "required"
}

@test "create-decision fails if file already exists" {
  create_decision "DL-001" "proposed"
  run bash "$SCRIPT" --id DL-001 --title "Duplicate"
  assert_failure
  assert_output --partial "already exists"
}

@test "create-decision places file in namespace directory" {
  setup_namespaced_project
  run bash "$SCRIPT" --id DL-001 --title "Billing thing" --namespace billing
  assert_success
  [[ -f decisions/records/billing/DL-001.md ]]
}

@test "create-decision includes namespace in frontmatter" {
  setup_namespaced_project
  bash "$SCRIPT" --id DL-001 --title "Auth thing" --namespace auth
  run cat decisions/records/auth/DL-001.md
  assert_output --partial 'namespace: auth'
}

@test "create-decision omits namespace field in flat mode" {
  bash "$SCRIPT" --id DL-001 --title "Flat thing"
  run grep "namespace:" decisions/records/DL-001.md
  assert_failure
}

@test "create-decision includes ISO-8601 timestamp" {
  bash "$SCRIPT" --id DL-001 --title "Timestamped"
  # Match ISO-8601 UTC format
  run grep -E "^timestamp: [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$" decisions/records/DL-001.md
  assert_success
}
