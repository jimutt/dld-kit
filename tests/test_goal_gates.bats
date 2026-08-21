#!/usr/bin/env bats
# Tests for dld-goal gates: guard-preconditions.sh, verify-item.sh,
# block-item.sh and resolve-block.sh

load 'test_helper/common'

setup() {
  setup_flat_project
  create_decision "DL-001" "proposed"
  create_decision "DL-002" "proposed"
  git add -A && git commit -qm "decisions"
  bash "$SKILLS_DIR/dld-goal/scripts/create-run.sh" --slug "run-a" --title "Run A" >/dev/null
  git add -A && git commit -qm "run" 2>/dev/null || true
}

teardown() {
  teardown_project
}

state() { bash "$SKILLS_DIR/dld-goal/scripts/run-state.sh" "$@"; }
guard() { bash "$SKILLS_DIR/dld-goal/scripts/guard-preconditions.sh" "$@"; }
verify_item() { bash "$SKILLS_DIR/dld-goal/scripts/verify-item.sh" "$@"; }
block_item() { bash "$SKILLS_DIR/dld-goal/scripts/block-item.sh" "$@"; }
resolve_block() { bash "$SKILLS_DIR/dld-goal/scripts/resolve-block.sh" "$@"; }

annotate() {
  mkdir -p src
  echo "// @decision($1)" >> src/code.ts
  git add -A && git commit -qm "annotate $1"
}

# --- guard-preconditions: start ---

@test "guard start passes on a clean tree with proposed decisions" {
  state set-status run-a stopped
  run guard start --decisions "DL-001,DL-002"
  assert_success
  assert_output ""
}

@test "guard start rejects a dirty working tree" {
  state set-status run-a stopped
  echo "scratch" > untracked.txt
  run guard start --decisions "DL-001"
  assert_failure
  assert_output --partial "working tree is dirty"
}

@test "guard start rejects a second active run" {
  run guard start --decisions "DL-001"
  assert_failure
  assert_output --partial "run 'run-a' is already active"
}

@test "guard start rejects a decision that does not exist" {
  state set-status run-a stopped
  run guard start --decisions "DL-404"
  assert_failure
  assert_output --partial "DL-404 does not exist"
}

@test "guard start rejects a decision that is not proposed" {
  state set-status run-a stopped
  bash "$SKILLS_DIR/dld-common/scripts/update-status.sh" DL-001 accepted >/dev/null
  git add -A && git commit -qm "accept"
  run guard start --decisions "DL-001"
  assert_failure
  assert_output --partial "DL-001 is 'accepted', not 'proposed'"
}

@test "guard start reports every problem, not just the first" {
  state set-status run-a stopped
  echo "scratch" > untracked.txt
  run guard start --decisions "DL-404"
  assert_failure
  assert_output --partial "working tree is dirty"
  assert_output --partial "DL-404 does not exist"
}

@test "guard start requires --decisions" {
  state set-status run-a stopped
  run guard start
  assert_failure
  assert_output --partial "--decisions is required"
}

@test "guard start flags an unresolved ID collision with the base" {
  state set-status run-a stopped
  git add -A && git commit -qm "state" 2>/dev/null || true
  base_branch="$(git rev-parse --abbrev-ref HEAD)"

  git checkout -q -b feature
  create_decision "DL-003" "proposed"
  git add -A && git commit -qm "local DL-003"

  # The same ID lands on the base branch too.
  git checkout -q "$base_branch"
  create_decision "DL-003" "proposed" "" "Base decision"
  git add -A && git commit -qm "base DL-003"
  git checkout -q feature

  run guard start --decisions "DL-003" --base "$base_branch"
  assert_failure
  assert_output --partial "decision ID collision"
  assert_output --partial "/dld-reindex"
}

# --- guard-preconditions: resume ---

@test "guard resume passes for a paused run" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state set-status run-a paused
  git add -A && git commit -qm "pause" 2>/dev/null || true
  run guard resume run-a
  assert_success
}

@test "guard resume rejects a stopped run" {
  state set-status run-a stopped
  run guard resume run-a
  assert_failure
  assert_output --partial "cannot be resumed"
}

@test "guard resume rejects a completed run" {
  state set-status run-a complete
  run guard resume run-a
  assert_failure
  assert_output --partial "cannot be resumed"
}

@test "guard resume fails for an unknown run" {
  run guard resume nope
  assert_failure
  assert_output --partial "not found"
}

@test "guard resume flags decisions that drifted while idle" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state set-status run-a paused
  printf '\nChanged while paused.\n' >> decisions/records/DL-001.md
  git add -A && git commit -qm "drift"

  run guard resume run-a
  assert_failure
  assert_output --partial "DL-001 changed since it was planned"
  assert_output --partial "replan"
}

@test "guard resume checks in-flight items too" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state set-item-status run-a 1 implementing
  state set-status run-a paused
  printf '\nChanged mid-flight.\n' >> decisions/records/DL-001.md
  git add -A && git commit -qm "drift"

  run guard resume run-a
  assert_failure
  assert_output --partial "DL-001 changed"
}

# --- verify-item ---

@test "verify-item passes when annotations exist and checks succeed" {
  annotate DL-001
  state add-item run-a --decisions "DL-001" --check "true" >/dev/null

  run verify_item run-a 1
  assert_success
  assert_output --partial "passed mechanical verification"
}

@test "verify-item fails when the annotation is missing" {
  state add-item run-a --decisions "DL-001" >/dev/null

  run verify_item run-a 1
  assert_failure
  assert_output --partial "MISSING annotations"
}

@test "verify-item fails when an acceptance check fails" {
  annotate DL-001
  state add-item run-a --decisions "DL-001" --check "false" >/dev/null

  run verify_item run-a 1
  assert_failure
  assert_output --partial "FAILED (1): false"
}

@test "verify-item runs every check even after one fails" {
  annotate DL-001
  state add-item run-a --decisions "DL-001" --check "false" --check "echo second" >/dev/null

  run verify_item run-a 1
  assert_failure
  assert_output --partial "running: echo second"
}

@test "verify-item records evidence for passes and failures alike" {
  annotate DL-001
  state add-item run-a --decisions "DL-001" --check "false" >/dev/null
  run verify_item run-a 1

  run jq -r '[.items[0].evidence[].kind] | join(",")' .dld/runs/run-a/state.json
  assert_output "annotations,check"

  run jq -r '.items[0].evidence[1].exit' .dld/runs/run-a/state.json
  assert_output "1"
}

@test "verify-item captures check output as evidence" {
  annotate DL-001
  state add-item run-a --decisions "DL-001" --check "echo diagnostic-detail" >/dev/null
  run verify_item run-a 1

  run jq -r '.items[0].evidence[1].output' .dld/runs/run-a/state.json
  assert_output --partial "diagnostic-detail"
}

@test "verify-item logs an event for the outcome" {
  annotate DL-001
  state add-item run-a --decisions "DL-001" --check "true" >/dev/null
  verify_item run-a 1

  run jq -r 'select(.type == "item-verified") | .item' .dld/runs/run-a/events.jsonl
  assert_output "1"
}

@test "verify-item verifies every decision in a batched item" {
  annotate DL-001
  state add-item run-a --decisions "DL-001,DL-002" >/dev/null

  run verify_item run-a 1
  assert_failure
  assert_output --partial "DL-002"
}

@test "verify-item fails for an unknown item" {
  run verify_item run-a 9
  assert_failure
  assert_output --partial "item 9 not found"
}

# --- block-item ---

@test "block-item refuses before the retry has been used" {
  state add-item run-a --decisions "DL-001" >/dev/null
  run block_item run-a 1 --reason "tests fail"
  assert_failure
  assert_output --partial "Retry once with the failure as context"
}

@test "block-item blocks after two attempts" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state bump-attempt run-a 1 >/dev/null
  state bump-attempt run-a 1 >/dev/null

  run block_item run-a 1 --reason "tests fail"
  assert_success

  run state get run-a '.items[0].status'
  assert_output "blocked"
  run state get run-a .status
  assert_output "blocked"
}

@test "block-item --force blocks immediately" {
  state add-item run-a --decisions "DL-001" >/dev/null
  run block_item run-a 1 --reason "unfixable" --force
  assert_success
}

@test "block-item records the question in the run, not the decision log" {
  state add-item run-a --decisions "DL-001" >/dev/null
  block_item run-a 1 --reason "acceptance check fails" --question "Relax the check or fix the code?" --force

  run jq -r '.blockedQuestions[0].reason' .dld/runs/run-a/state.json
  assert_output "acceptance check fails"
  run jq -r '.blockedQuestions[0].question' .dld/runs/run-a/state.json
  assert_output "Relax the check or fix the code?"
  run jq -r '.blockedQuestions[0].answer' .dld/runs/run-a/state.json
  assert_output "null"

  # Nothing was written to the decision log.
  run bash -c "ls decisions/records/ | wc -l | tr -d ' '"
  assert_output "2"
}

@test "block-item supplies a default question" {
  state add-item run-a --decisions "DL-001" >/dev/null
  block_item run-a 1 --reason "stuck" --force
  run jq -r '.blockedQuestions[0].question' .dld/runs/run-a/state.json
  assert_output --partial "retry"
}

@test "block-item logs an event" {
  state add-item run-a --decisions "DL-001" >/dev/null
  block_item run-a 1 --reason "stuck" --force
  run jq -r 'select(.type == "item-blocked") | .reason' .dld/runs/run-a/events.jsonl
  assert_output "stuck"
}

@test "block-item requires a reason" {
  state add-item run-a --decisions "DL-001" >/dev/null
  run block_item run-a 1 --force
  assert_failure
  assert_output --partial "--reason is required"
}

# --- resolve-block ---

@test "resolve-block retry returns the item to implementing and reactivates the run" {
  state add-item run-a --decisions "DL-001" >/dev/null
  block_item run-a 1 --reason "stuck" --force

  run resolve_block run-a 1 --answer "use the v2 endpoint" --action retry
  assert_success

  run state get run-a '.items[0].status'
  assert_output "implementing"
  run state get run-a .status
  assert_output "active"
}

@test "resolve-block skip marks the item skipped and continues the run" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state add-item run-a --decisions "DL-002" >/dev/null
  block_item run-a 1 --reason "stuck" --force
  resolve_block run-a 1 --answer "not worth it now" --action skip

  run state get run-a '.items[0].status'
  assert_output "skipped"

  # The queue moves on rather than stalling behind the blocker.
  run bash "$SKILLS_DIR/dld-goal/scripts/next-item.sh" run-a
  assert_output "2"
}

@test "resolve-block records the answer against the question" {
  state add-item run-a --decisions "DL-001" >/dev/null
  block_item run-a 1 --reason "stuck" --force
  resolve_block run-a 1 --answer "use the v2 endpoint" --action retry

  run jq -r '.blockedQuestions[0].answer' .dld/runs/run-a/state.json
  assert_output "use the v2 endpoint"
  run jq -r '.blockedQuestions[0].resolution' .dld/runs/run-a/state.json
  assert_output "retry"
}

@test "resolve-block answers the oldest open question for the item" {
  state add-item run-a --decisions "DL-001" >/dev/null
  block_item run-a 1 --reason "first" --force
  resolve_block run-a 1 --answer "answer one" --action retry
  block_item run-a 1 --reason "second" --force
  resolve_block run-a 1 --answer "answer two" --action retry

  run jq -r '[.blockedQuestions[].answer] | join("|")' .dld/runs/run-a/state.json
  assert_output "answer one|answer two"
}

@test "resolve-block rejects an item that is not blocked" {
  state add-item run-a --decisions "DL-001" >/dev/null
  run resolve_block run-a 1 --answer "x" --action retry
  assert_failure
  assert_output --partial "not blocked"
}

@test "resolve-block rejects an unknown action" {
  state add-item run-a --decisions "DL-001" >/dev/null
  block_item run-a 1 --reason "stuck" --force
  run resolve_block run-a 1 --answer "x" --action abandon
  assert_failure
  assert_output --partial "must be 'retry' or 'skip'"
}

@test "resolve-block requires an answer" {
  state add-item run-a --decisions "DL-001" >/dev/null
  block_item run-a 1 --reason "stuck" --force
  run resolve_block run-a 1 --action skip
  assert_failure
  assert_output --partial "--answer is required"
}

# --- checks execute without a shell ---

@test "verify-item passes check arguments through literally" {
  annotate DL-001
  state add-item run-a --decisions "DL-001" --check "echo one two" >/dev/null
  verify_item run-a 1

  run jq -r '.items[0].evidence[1].output' .dld/runs/run-a/state.json
  assert_output "one two"
}

@test "verify-item stores the check command as argv" {
  annotate DL-001
  state add-item run-a --decisions "DL-001" --check "echo hi" >/dev/null
  verify_item run-a 1

  run jq -c '.items[0].evidence[1].command' .dld/runs/run-a/state.json
  assert_output '["echo","hi"]'
}

@test "verify-item reports a check binary that does not exist" {
  annotate DL-001
  state add-item run-a --decisions "DL-001" --check "definitely-not-a-real-binary" >/dev/null

  run verify_item run-a 1
  assert_failure
  assert_output --partial "FAILED (127)"
}
