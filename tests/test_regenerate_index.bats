#!/usr/bin/env bats
# Tests for dld-common/scripts/regenerate-index.sh

load 'test_helper/common'

SCRIPT=""

setup() {
  setup_flat_project
  SCRIPT="$SKILLS_DIR/dld-common/scripts/regenerate-index.sh"
}

teardown() {
  teardown_project
}

@test "regenerate-index creates empty index with no decisions" {
  run bash "$SCRIPT"
  assert_success
  assert_output --partial "empty"

  [[ -f decisions/INDEX.md ]]
  run cat decisions/INDEX.md
  assert_output --partial "# Decision Log"
  assert_output --partial "| ID | Title | Status | Tags |"
}

@test "regenerate-index lists decisions in descending order" {
  create_decision "DL-001" "accepted"
  create_decision "DL-002" "proposed"
  create_decision "DL-003" "accepted"

  bash "$SCRIPT"
  run cat decisions/INDEX.md

  # DL-003 should appear before DL-001
  assert_output --partial "DL-003"
  assert_output --partial "DL-001"
}

@test "regenerate-index includes all statuses" {
  create_decision "DL-001" "accepted"
  create_decision "DL-002" "superseded"
  create_decision "DL-003" "deprecated"

  bash "$SCRIPT"
  run cat decisions/INDEX.md
  assert_output --partial "accepted"
  assert_output --partial "superseded"
  assert_output --partial "deprecated"
}

@test "regenerate-index flat mode omits namespace column" {
  create_decision "DL-001" "accepted"
  bash "$SCRIPT"

  run cat decisions/INDEX.md
  assert_output --partial "| ID | Title | Status | Tags |"
  refute_output --partial "Namespace"
}

@test "regenerate-index namespaced mode includes namespace column" {
  setup_namespaced_project
  create_decision "DL-001" "accepted" "billing"

  bash "$SCRIPT"
  run cat decisions/INDEX.md
  assert_output --partial "| ID | Title | Status | Namespace | Tags |"
}

@test "regenerate-index extracts tags correctly" {
  create_decision "DL-001" "accepted"
  bash "$SCRIPT"

  run cat decisions/INDEX.md
  assert_output --partial "test, example"
}

@test "regenerate-index fails when records dir missing" {
  rmdir decisions/records
  run bash "$SCRIPT"
  assert_failure
  assert_output --partial "records directory not found"
}

@test "regenerate-index --include-base merges base-only decisions" {
  # Seed `main` with DL-001 and DL-002, then branch off.
  create_decision "DL-001" "accepted"
  create_decision "DL-002" "accepted"
  git add -A
  git commit --quiet -m "seed main"
  git branch -M main
  git checkout -b feature --quiet

  # Locally drop DL-002 and add DL-005 — simulates a renamed-away decision.
  rm decisions/records/DL-002.md
  create_decision "DL-005" "proposed"
  git add -A
  git commit --quiet -m "local DL-005"

  run bash "$SCRIPT" --include-base main
  assert_success

  run cat decisions/INDEX.md
  # Local DL-005 present
  assert_output --partial "DL-005"
  # Base-only DL-002 pulled in
  assert_output --partial "DL-002"
  # Shared DL-001 present
  assert_output --partial "DL-001"
}

@test "regenerate-index --include-base prefers local content over base" {
  create_decision "DL-001" "accepted"
  git add -A
  git commit --quiet -m "seed main"
  git branch -M main
  git checkout -b feature --quiet

  # Edit DL-001 locally so we can detect which side wins.
  sed -i.bak 's/^status: accepted$/status: superseded/' decisions/records/DL-001.md
  rm decisions/records/DL-001.md.bak
  git add -A
  git commit --quiet -m "local edit"

  bash "$SCRIPT" --include-base main
  run cat decisions/INDEX.md
  assert_output --partial "superseded"
  refute_output --partial "| DL-001 | Test decision DL-001 | accepted |"
}

@test "regenerate-index --include-base rejects unknown ref" {
  create_decision "DL-001" "accepted"
  run bash "$SCRIPT" --include-base does/not/exist
  assert_failure
  assert_output --partial "not found"
}

@test "regenerate-index overwrites existing INDEX.md" {
  echo "old content" > decisions/INDEX.md
  create_decision "DL-001" "accepted"

  bash "$SCRIPT"
  run cat decisions/INDEX.md
  refute_output --partial "old content"
  assert_output --partial "# Decision Log"
}
