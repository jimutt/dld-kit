#!/usr/bin/env bats
# Tests for dld-reindex skill scripts.
# Uses a local `main` branch in lieu of `origin/main` so tests don't need a remote.

load 'test_helper/common'

REINDEX_DIR=""

setup() {
  setup_flat_project
  REINDEX_DIR="$SKILLS_DIR/dld-reindex/scripts"

  # Establish a `main` branch with one decision already on it, then branch off.
  # Seed INDEX.md alongside so the merge-base has it — mirrors a real project
  # where /dld-init creates INDEX.md before any branch diverges.
  create_decision "DL-001" "accepted"
  bash "$SKILLS_DIR/dld-common/scripts/regenerate-index.sh" >/dev/null
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

# --- resolve-base.sh ---------------------------------------------------------

@test "resolve-base: returns upstream when it differs from the current branch" {
  # Stand up a fake remote so @{upstream} resolves to a different branch.
  git update-ref refs/remotes/origin/main HEAD
  git config branch.feature.remote origin
  git config branch.feature.merge refs/heads/main
  run bash "$REINDEX_DIR/resolve-base.sh"
  assert_success
  assert_output "origin/main"
}

@test "resolve-base: falls back to origin/main when upstream equals current branch" {
  # Simulate "the branch's upstream is its own remote copy".
  git update-ref refs/remotes/origin/feature HEAD
  git config branch.feature.remote origin
  git config branch.feature.merge refs/heads/feature
  run bash "$REINDEX_DIR/resolve-base.sh"
  assert_success
  assert_output "origin/main"
}

@test "resolve-base: falls back to origin/main when no upstream is configured" {
  run bash "$REINDEX_DIR/resolve-base.sh"
  assert_success
  assert_output "origin/main"
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

# --- commit-reindex.sh -------------------------------------------------------

@test "commit-reindex: squashes branch commits into a single reindex commit" {
  # Two branch commits, both adding a colliding decision.
  git checkout main --quiet
  create_decision "DL-002" "accepted"
  git add -A
  git commit --quiet -m "land DL-002 on main"
  git checkout feature --quiet

  create_decision "DL-002" "proposed"
  git add -A
  git commit --quiet -m "feature: draft DL-002"

  mkdir -p src
  echo "# @decision(DL-002)" > src/foo.txt
  git add -A
  git commit --quiet -m "feature: add annotation"

  # Apply the reindex flow as the SKILL would. INDEX.md is deliberately NOT
  # regenerated here — commit-reindex.sh leaves INDEX.md at merge-base state.
  PLAN=$(bash "$REINDEX_DIR/plan-renames.sh" --base main 2>/dev/null)
  echo "$PLAN" | while IFS=$'\t' read -r path old new; do
    bash "$REINDEX_DIR/rename-decision.sh" --old "$old" --new "$new" --path "$path" --base main
  done >/dev/null
  echo "$PLAN" | bash "$REINDEX_DIR/commit-reindex.sh" --base main >/dev/null

  # Exactly one commit on feature above merge-base.
  MERGE_BASE=$(git merge-base main HEAD)
  run git log --format='%s' "$MERGE_BASE"..HEAD
  assert_success
  assert_line --index 0 --partial "reindex local decisions"

  COMMIT_COUNT=$(git log --format='%s' "$MERGE_BASE"..HEAD | wc -l | tr -d ' ')
  [[ "$COMMIT_COUNT" -eq 1 ]]
}

@test "commit-reindex: leaves INDEX.md at merge-base state (not modified by the reindex commit)" {
  git checkout main --quiet
  create_decision "DL-002" "accepted"
  git add -A
  git commit --quiet -m "land DL-002 on main"
  git checkout feature --quiet

  create_decision "DL-002" "proposed"
  bash "$SKILLS_DIR/dld-common/scripts/regenerate-index.sh" >/dev/null
  git add -A
  git commit --quiet -m "feature: draft DL-002 + INDEX update"

  PLAN=$(bash "$REINDEX_DIR/plan-renames.sh" --base main 2>/dev/null)
  echo "$PLAN" | while IFS=$'\t' read -r path old new; do
    bash "$REINDEX_DIR/rename-decision.sh" --old "$old" --new "$new" --path "$path" --base main
  done >/dev/null
  echo "$PLAN" | bash "$REINDEX_DIR/commit-reindex.sh" --base main >/dev/null

  # The reindex commit's INDEX.md must match the merge-base's INDEX.md exactly.
  MERGE_BASE=$(git merge-base main HEAD)
  run git diff "$MERGE_BASE" HEAD -- decisions/INDEX.md
  assert_success
  assert_output ""

  # Working tree's INDEX.md also matches (so the user doesn't see uncommitted changes).
  run git status --porcelain decisions/INDEX.md
  assert_output ""
}

@test "commit-reindex: does NOT sweep in untracked unrelated paths" {
  git checkout main --quiet
  create_decision "DL-002" "accepted"
  git add -A
  git commit --quiet -m "land DL-002 on main"
  git checkout feature --quiet

  create_decision "DL-002" "proposed"
  git add -A
  git commit --quiet -m "feature: draft DL-002"

  # Drop an untracked file that should NOT end up in the squashed commit.
  mkdir -p .claude/worktrees
  echo "scratch" > .claude/worktrees/random.txt
  echo "stray" > untracked-stray.txt

  PLAN=$(bash "$REINDEX_DIR/plan-renames.sh" --base main 2>/dev/null)
  echo "$PLAN" | while IFS=$'\t' read -r path old new; do
    bash "$REINDEX_DIR/rename-decision.sh" --old "$old" --new "$new" --path "$path" --base main
  done >/dev/null
  echo "$PLAN" | bash "$REINDEX_DIR/commit-reindex.sh" --base main >/dev/null

  # The committed tree must NOT contain the untracked stray files.
  run git ls-tree -r HEAD
  refute_output --partial ".claude/worktrees/random.txt"
  refute_output --partial "untracked-stray.txt"

  # They should still be present on disk (we didn't delete them).
  [[ -f .claude/worktrees/random.txt ]]
  [[ -f untracked-stray.txt ]]
}

@test "commit-reindex: errors out when stdin plan is empty" {
  run bash -c "echo '' | bash \"$REINDEX_DIR/commit-reindex.sh\" --base main"
  assert_failure
  assert_output --partial "no rename plan"
}

# --- end-to-end --------------------------------------------------------------

@test "end-to-end: post-reindex branch rebases cleanly onto main" {
  # main lands DL-002 + DL-003 + DL-004 after the branch point.
  git checkout main --quiet
  create_decision "DL-002" "accepted"
  create_decision "DL-003" "accepted"
  create_decision "DL-004" "accepted"
  bash "$SKILLS_DIR/dld-common/scripts/regenerate-index.sh" >/dev/null
  git add -A
  git commit --quiet -m "land DL-002 DL-003 DL-004"
  git checkout feature --quiet

  # feature drafts DL-002 and DL-003 with annotations.
  create_decision "DL-002" "proposed"
  create_decision "DL-003" "proposed"
  mkdir -p src
  echo "# @decision(DL-002)" > src/auth.py
  echo "# @decision(DL-003)" > src/billing.py
  bash "$SKILLS_DIR/dld-common/scripts/regenerate-index.sh" >/dev/null
  git add -A
  git commit --quiet -m "feature: draft DL-002 and DL-003 + annotations"

  # Run the SKILL's flow (no INDEX regen during reindex — commit-reindex.sh
  # leaves INDEX.md alone so the rebase is conflict-free).
  PLAN=$(bash "$REINDEX_DIR/plan-renames.sh" --base main 2>/dev/null)
  echo "$PLAN" | while IFS=$'\t' read -r path old new; do
    bash "$REINDEX_DIR/rename-decision.sh" --old "$old" --new "$new" --path "$path" --base main
  done >/dev/null
  echo "$PLAN" | bash "$REINDEX_DIR/commit-reindex.sh" --base main >/dev/null

  # Now rebase onto main — this used to fail with an add/add conflict.
  run git rebase main
  assert_success

  # After rebase: main's DL-002 and DL-003 exist, and the renamed locals exist.
  [[ -f decisions/records/DL-002.md ]]
  [[ -f decisions/records/DL-003.md ]]
  [[ -f decisions/records/DL-005.md ]]
  [[ -f decisions/records/DL-006.md ]]

  # The DL-002 on disk is main's version (status: accepted), not the draft.
  run grep '^status:' decisions/records/DL-002.md
  assert_output --partial "accepted"

  # Annotations were rewritten to the new IDs.
  run cat src/auth.py
  assert_output --partial "@decision(DL-005)"
  run cat src/billing.py
  assert_output --partial "@decision(DL-006)"

  # INDEX.md post-rebase matches main's INDEX.md (missing rows for renamed
  # locals — the user needs to regenerate as documented).
  run grep -c "DL-005\|DL-006" decisions/INDEX.md
  assert_output "0"

  # Regenerating INDEX.md post-rebase repopulates the renamed rows.
  bash "$SKILLS_DIR/dld-common/scripts/regenerate-index.sh" >/dev/null
  run grep -c "DL-005\|DL-006" decisions/INDEX.md
  refute_output "0"
}
