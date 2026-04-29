#!/usr/bin/env bats
# Tests for dld-audit/scripts/find-missing-amends.sh

load 'test_helper/common'

SCRIPT=""

setup() {
  setup_flat_project
  SCRIPT="$SKILLS_DIR/dld-audit/scripts/find-missing-amends.sh"
}

teardown() {
  teardown_project
}

# Helper: create a decision with a custom body
# Usage: create_decision_with_body <id> <supersedes> <amends> <body>
create_decision_with_body() {
  local id="$1"
  local supersedes="$2"
  local amends="$3"
  local body="$4"

  cat > "decisions/records/$id.md" <<EOF
---
id: $id
title: "Test decision $id"
timestamp: 2026-01-15T10:00:00Z
status: accepted
supersedes: [$supersedes]
amends: [$amends]
tags: [test]
references: []
---

$body
EOF
}

@test "find-missing-amends returns nothing with no decisions" {
  run bash "$SCRIPT"
  assert_success
  assert_output ""
}

@test "find-missing-amends returns nothing when no body references" {
  create_decision_with_body "DL-001" "" "" "## Decision
Just a simple decision with no references."
  run bash "$SCRIPT"
  assert_success
  assert_output ""
}

@test "find-missing-amends finds undeclared body reference" {
  create_decision_with_body "DL-001" "" "" "## Decision
Original decision."
  create_decision_with_body "DL-002" "" "" "## Decision
This changes the caching strategy from DL-001."
  run bash "$SCRIPT"
  assert_success
  assert_output "DL-002:DL-001"
}

@test "find-missing-amends ignores self-references" {
  create_decision_with_body "DL-001" "" "" "## Decision
This is DL-001, referencing itself."
  run bash "$SCRIPT"
  assert_success
  assert_output ""
}

@test "find-missing-amends ignores references already in supersedes" {
  create_decision_with_body "DL-001" "" "" "## Decision
Original."
  create_decision_with_body "DL-002" "DL-001" "" "## Decision
Replaces DL-001 entirely."
  run bash "$SCRIPT"
  assert_success
  assert_output ""
}

@test "find-missing-amends ignores references already in amends" {
  create_decision_with_body "DL-001" "" "" "## Decision
Original."
  create_decision_with_body "DL-002" "" "DL-001" "## Decision
Partially modifies DL-001."
  run bash "$SCRIPT"
  assert_success
  assert_output ""
}

@test "find-missing-amends reports multiple missing references" {
  create_decision_with_body "DL-001" "" "" "## Decision
First."
  create_decision_with_body "DL-002" "" "" "## Decision
Second."
  create_decision_with_body "DL-003" "" "" "## Decision
This modifies parts of DL-001 and DL-002."
  run bash "$SCRIPT"
  assert_success
  assert_line "DL-003:DL-001"
  assert_line "DL-003:DL-002"
}

@test "find-missing-amends skips unchanged source decisions when audit state is set" {
  create_decision_with_body "DL-001" "" "" "## Decision
Original."
  create_decision_with_body "DL-002" "" "" "## Decision
This changes the caching strategy from DL-001."
  git add -A && git commit -q -m "decisions"
  commit=$(git rev-parse --short HEAD)
  cat > decisions/.dld-state.yaml <<EOF
audit:
  last_run: 2026-01-15T10:00:00Z
  commit_hash: $commit
EOF

  # Nothing changed since the audit commit — DL-002:DL-001 should not re-surface.
  run bash "$SCRIPT"
  assert_success
  assert_output ""
}

@test "find-missing-amends re-surfaces a candidate when its source decision is edited" {
  create_decision_with_body "DL-001" "" "" "## Decision
Original."
  create_decision_with_body "DL-002" "" "" "## Decision
This changes the caching strategy from DL-001."
  git add -A && git commit -q -m "decisions"
  commit=$(git rev-parse --short HEAD)
  cat > decisions/.dld-state.yaml <<EOF
audit:
  last_run: 2026-01-15T10:00:00Z
  commit_hash: $commit
EOF

  # Edit DL-002 (the source of the reference) — it should re-surface.
  create_decision_with_body "DL-002" "" "" "## Decision
This changes the caching strategy from DL-001 (revised)."

  run bash "$SCRIPT"
  assert_success
  assert_output "DL-002:DL-001"
}

@test "find-missing-amends does not re-surface when only the referenced decision is edited" {
  create_decision_with_body "DL-001" "" "" "## Decision
Original."
  create_decision_with_body "DL-002" "" "" "## Decision
This changes the caching strategy from DL-001."
  git add -A && git commit -q -m "decisions"
  commit=$(git rev-parse --short HEAD)
  cat > decisions/.dld-state.yaml <<EOF
audit:
  last_run: 2026-01-15T10:00:00Z
  commit_hash: $commit
EOF

  # Edit DL-001 (the referenced decision) — DL-002's reference is unchanged.
  create_decision_with_body "DL-001" "" "" "## Decision
Original (revised)."

  run bash "$SCRIPT"
  assert_success
  assert_output ""
}

@test "find-missing-amends surfaces untracked new decisions even with audit state" {
  create_decision_with_body "DL-001" "" "" "## Decision
Original."
  git add -A && git commit -q -m "first decision"
  commit=$(git rev-parse --short HEAD)
  cat > decisions/.dld-state.yaml <<EOF
audit:
  last_run: 2026-01-15T10:00:00Z
  commit_hash: $commit
EOF

  # Add a new (untracked) decision referencing DL-001.
  create_decision_with_body "DL-002" "" "" "## Decision
This changes the caching strategy from DL-001."

  run bash "$SCRIPT"
  assert_success
  assert_output "DL-002:DL-001"
}

@test "find-missing-amends --all ignores audit state" {
  create_decision_with_body "DL-001" "" "" "## Decision
Original."
  create_decision_with_body "DL-002" "" "" "## Decision
This changes the caching strategy from DL-001."
  git add -A && git commit -q -m "decisions"
  commit=$(git rev-parse --short HEAD)
  cat > decisions/.dld-state.yaml <<EOF
audit:
  last_run: 2026-01-15T10:00:00Z
  commit_hash: $commit
EOF

  run bash "$SCRIPT" --all
  assert_success
  assert_output "DL-002:DL-001"
}

@test "find-missing-amends falls back to scanning all when audit commit is unknown to the repo" {
  create_decision_with_body "DL-001" "" "" "## Decision
Original."
  create_decision_with_body "DL-002" "" "" "## Decision
This changes the caching strategy from DL-001."
  cat > decisions/.dld-state.yaml <<EOF
audit:
  last_run: 2026-01-15T10:00:00Z
  commit_hash: deadbeef
EOF

  run bash "$SCRIPT"
  assert_success
  assert_output "DL-002:DL-001"
}

@test "find-missing-amends works with namespaced decisions" {
  setup_namespaced_project
  mkdir -p decisions/records/billing

  cat > "decisions/records/billing/DL-001.md" <<'EOF'
---
id: DL-001
title: "Original"
timestamp: 2026-01-15T10:00:00Z
status: accepted
supersedes: []
amends: []
namespace: billing
tags: [test]
references: []
---

## Decision
Original billing decision.
EOF

  cat > "decisions/records/billing/DL-002.md" <<'EOF'
---
id: DL-002
title: "Amendment"
timestamp: 2026-01-16T10:00:00Z
status: accepted
supersedes: []
amends: []
namespace: billing
tags: [test]
references: []
---

## Decision
Changes the rounding portion of DL-001.
EOF

  run bash "$SCRIPT"
  assert_success
  assert_output "DL-002:DL-001"
}
