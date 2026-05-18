#!/usr/bin/env bats
# Tests for dld-reindex skill scripts.
# Uses a local `main` branch in lieu of `origin/main` so tests don't need a remote.

load 'test_helper/common'

REINDEX_DIR=""

setup() {
  setup_flat_project
  REINDEX_DIR="$SKILLS_DIR/dld-reindex/scripts"

  # Establish a `main` branch with one decision already on it, then branch off.
  create_decision "DL-001" "accepted"
  git add -A
  git commit --quiet -m "seed main"
  git branch -M main
  git checkout -b feature --quiet
}

teardown() {
  teardown_project
}

# --- find-collisions.sh -------------------------------------------------------

@test "find-collisions: no output when there are no local additions" {
  run bash -c "bash \"$REINDEX_DIR/find-collisions.sh\" --base main 2>/dev/null"
  assert_success
  assert_output ""
}

@test "find-collisions: no output when local additions don't collide" {
  create_decision "DL-002" "proposed"
  git add -A
  git commit --quiet -m "add DL-002"
  run bash -c "bash \"$REINDEX_DIR/find-collisions.sh\" --base main 2>/dev/null"
  assert_success
  assert_output ""
}

@test "find-collisions: detects a single ID collision" {
  # Simulate someone else landing DL-002 on main while we drafted DL-002 too.
  git checkout main --quiet
  create_decision "DL-002" "accepted"
  git add -A
  git commit --quiet -m "land DL-002 on main"
  git checkout feature --quiet

  create_decision "DL-002" "proposed"
  git add -A
  git commit --quiet -m "local DL-002"

  run bash "$REINDEX_DIR/find-collisions.sh" --base main
  assert_success
  assert_output --partial $'decisions/records/DL-002.md\tDL-002'
}

@test "find-collisions: ignores files that aren't DL-NNN.md" {
  echo "junk" > decisions/records/notes.md
  git add -A
  git commit --quiet -m "add notes"
  run bash -c "bash \"$REINDEX_DIR/find-collisions.sh\" --base main 2>/dev/null"
  assert_success
  assert_output ""
}

@test "find-collisions: errors out on unknown base ref" {
  run bash "$REINDEX_DIR/find-collisions.sh" --base does/not/exist
  assert_failure
  assert_output --partial "not found"
}

# --- list-taken-ids.sh -------------------------------------------------------

@test "list-taken-ids: outputs IDs present on the base branch" {
  run bash "$REINDEX_DIR/list-taken-ids.sh" --base main
  assert_success
  assert_output --partial "DL-001"
}

@test "list-taken-ids: gracefully skips PR scan when not on a GitHub remote" {
  # No origin remote at all in this test repo.
  run bash "$REINDEX_DIR/list-taken-ids.sh" --base main
  assert_success
  # stderr note is captured into output by bats when stderr is merged; just
  # confirm the command still succeeded with the base-branch IDs.
  assert_output --partial "DL-001"
}

# --- plan-renames.sh ---------------------------------------------------------

@test "plan-renames: empty output when there are no collisions" {
  create_decision "DL-005" "proposed"
  git add -A
  git commit --quiet -m "local DL-005"

  run bash -c "bash \"$REINDEX_DIR/plan-renames.sh\" --base main 2>/dev/null"
  assert_success
  assert_output ""
}

@test "plan-renames: assigns the next free ID above max(taken ∪ local_added)" {
  # main lands DL-007 after the branch point.
  git checkout main --quiet
  create_decision "DL-007" "accepted"
  git add -A
  git commit --quiet -m "land DL-007 on main"
  git checkout feature --quiet

  # Local adds DL-007 (collides with main) and DL-009 (kept).
  create_decision "DL-007" "proposed"
  create_decision "DL-009" "proposed"
  git add -A
  git commit --quiet -m "local DL-007 and DL-009"

  run bash -c "bash \"$REINDEX_DIR/plan-renames.sh\" --base main 2>/dev/null"
  assert_success
  # max(taken ∪ local_added) = max({DL-001, DL-007} ∪ {DL-007, DL-009}) = 9 → next free = DL-010
  assert_output --partial $'decisions/records/DL-007.md\tDL-007\tDL-010'
}

@test "plan-renames: multiple collisions get sequential free IDs" {
  git checkout main --quiet
  create_decision "DL-002" "accepted"
  create_decision "DL-003" "accepted"
  git add -A
  git commit --quiet -m "land DL-002 and DL-003 on main"
  git checkout feature --quiet

  create_decision "DL-002" "proposed"
  create_decision "DL-003" "proposed"
  git add -A
  git commit --quiet -m "local DL-002 and DL-003"

  run bash -c "bash \"$REINDEX_DIR/plan-renames.sh\" --base main 2>/dev/null"
  assert_success
  # max(taken) = 3, max(local_added) = 3 → next free = DL-004, DL-005
  assert_output --partial $'decisions/records/DL-002.md\tDL-002\tDL-004'
  assert_output --partial $'decisions/records/DL-003.md\tDL-003\tDL-005'
}

# --- rename-decision.sh ------------------------------------------------------

@test "rename-decision: git mv preserves rename history" {
  create_decision "DL-002" "proposed"
  git add -A
  git commit --quiet -m "local DL-002"

  run bash "$REINDEX_DIR/rename-decision.sh" \
    --old DL-002 --new DL-007 \
    --path decisions/records/DL-002.md \
    --base main
  assert_success

  [[ ! -e decisions/records/DL-002.md ]]
  [[ -e decisions/records/DL-007.md ]]

  # Stage-side rename detection via git status (RM = rename + modify after frontmatter patch)
  run git status --porcelain
  assert_output --partial "decisions/records/DL-002.md -> decisions/records/DL-007.md"
}

@test "rename-decision: patches frontmatter id field" {
  create_decision "DL-002" "proposed"
  git add -A
  git commit --quiet -m "local DL-002"

  bash "$REINDEX_DIR/rename-decision.sh" \
    --old DL-002 --new DL-007 \
    --path decisions/records/DL-002.md \
    --base main

  run cat decisions/records/DL-007.md
  assert_output --partial "id: DL-007"
  refute_output --partial "id: DL-002"
}

@test "rename-decision: rewrites self-references inside the renamed file" {
  cat > decisions/records/DL-002.md <<'EOF'
---
id: DL-002
title: "Test"
timestamp: 2026-01-15T10:00:00Z
status: proposed
supersedes: []
amends: []
tags: []
references: []
---

This decision DL-002 references itself in the body.
EOF
  git add -A
  git commit --quiet -m "local DL-002"

  bash "$REINDEX_DIR/rename-decision.sh" \
    --old DL-002 --new DL-007 \
    --path decisions/records/DL-002.md \
    --base main

  run cat decisions/records/DL-007.md
  assert_output --partial "This decision DL-007 references itself"
  refute_output --partial "DL-002"
}

@test "rename-decision: rewrites @decision annotations in code (local changes only)" {
  create_decision "DL-002" "proposed"
  mkdir -p src
  cat > src/auth.py <<'EOF'
# @decision(DL-002)
def login(): pass
EOF
  git add -A
  git commit --quiet -m "local DL-002 + code"

  bash "$REINDEX_DIR/rename-decision.sh" \
    --old DL-002 --new DL-007 \
    --path decisions/records/DL-002.md \
    --base main

  run cat src/auth.py
  assert_output --partial "@decision(DL-007)"
  refute_output --partial "@decision(DL-002)"
}

@test "rename-decision: rewrites cross-refs in other local decisions" {
  create_decision "DL-002" "proposed"
  cat > decisions/records/DL-003.md <<'EOF'
---
id: DL-003
title: "Builds on DL-002"
timestamp: 2026-01-15T10:00:00Z
status: proposed
supersedes: []
amends: [DL-002]
tags: []
references: []
---

This decision builds on DL-002.
EOF
  git add -A
  git commit --quiet -m "local DL-002 and DL-003"

  bash "$REINDEX_DIR/rename-decision.sh" \
    --old DL-002 --new DL-007 \
    --path decisions/records/DL-002.md \
    --base main

  run cat decisions/records/DL-003.md
  assert_output --partial "amends: [DL-007]"
  assert_output --partial "builds on DL-007"
  refute_output --partial "DL-002"
}

@test "rename-decision: digit-aware substitution does not rewrite DL-100 inside DL-1000" {
  create_decision "DL-100" "proposed"
  # Hand-craft a body containing DL-1000 mention.
  cat > decisions/records/DL-100.md <<'EOF'
---
id: DL-100
title: "Test"
timestamp: 2026-01-15T10:00:00Z
status: proposed
supersedes: []
amends: []
tags: []
references: []
---

This refers to DL-100 and also unrelated DL-1000.
EOF
  git add -A
  git commit --quiet -m "local DL-100"

  bash "$REINDEX_DIR/rename-decision.sh" \
    --old DL-100 --new DL-200 \
    --path decisions/records/DL-100.md \
    --base main

  run cat decisions/records/DL-200.md
  assert_output --partial "refers to DL-200 and also unrelated DL-1000"
}

@test "rename-decision: fails when target file already exists" {
  create_decision "DL-002" "proposed"
  create_decision "DL-007" "proposed"
  git add -A
  git commit --quiet -m "two locals"

  run bash "$REINDEX_DIR/rename-decision.sh" \
    --old DL-002 --new DL-007 \
    --path decisions/records/DL-002.md \
    --base main
  assert_failure
  assert_output --partial "already exists"
}

@test "rename-decision: fails on invalid IDs" {
  run bash "$REINDEX_DIR/rename-decision.sh" \
    --old DL-002 --new "not-an-id" \
    --path decisions/records/DL-002.md \
    --base main
  assert_failure
  assert_output --partial "DL-[0-9]+"
}
