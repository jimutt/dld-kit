#!/usr/bin/env bats
# Tests for dld-run/scripts/run-state.sh and append-event.sh

load 'test_helper/common'

setup() {
  setup_flat_project
  bash "$SKILLS_DIR/dld-run/scripts/create-run.sh" --slug "run-a" --title "Run A" >/dev/null
}

teardown() {
  teardown_project
}

state() {
  bash "$SKILLS_DIR/dld-run/scripts/run-state.sh" "$@"
}

event() {
  bash "$SKILLS_DIR/dld-run/scripts/append-event.sh" "$@"
}

@test "get prints the whole state document" {
  run state get run-a
  assert_success
  assert_output --partial '"slug": "run-a"'
}

@test "get prints a single field" {
  run state get run-a .status
  assert_success
  assert_output "active"
}

@test "get prints a nested field" {
  run state get run-a .bounds.maxItems
  assert_success
  assert_output "0"
}

@test "get rejects an unsupported jq path" {
  run state get run-a '. | halt_error'
  assert_failure
  assert_output --partial "unsupported jq path"
}

@test "get fails for an unknown run" {
  run state get nope .status
  assert_failure
  assert_output --partial "not found"
}

@test "set updates a field" {
  state set run-a .bounds.maxItems 7
  run state get run-a .bounds.maxItems
  assert_output "7"
}

@test "set accepts complex JSON values" {
  state set run-a .blockedQuestions '[{"item":1,"question":"why"}]'
  run state get run-a '.blockedQuestions[0].question'
  assert_output "why"
}

@test "set rejects invalid JSON" {
  run state set run-a .title 'not json'
  assert_failure
  assert_output --partial "valid JSON"
}

@test "set refreshes updatedAt" {
  before="$(state get run-a .updatedAt)"
  sleep 1
  state set run-a .bounds.maxItems 3
  after="$(state get run-a .updatedAt)"
  [ "$before" != "$after" ]
}

@test "set leaves state valid JSON" {
  state set run-a .bounds.maxMinutes 30
  run jq -e . .dld/runs/run-a/state.json
  assert_success
}

@test "set-status accepts valid statuses" {
  # Note: bats overwrites $status with the last exit code, so the loop variable
  # must not be named status.
  for s in active paused blocked complete stopped; do
    state set-status run-a "$s"
    run state get run-a .status
    assert_output "$s"
  done
}

@test "set-status rejects an unknown status" {
  run state set-status run-a "finished"
  assert_failure
  assert_output --partial "invalid run status"
}

@test "set-status does not corrupt state on rejection" {
  run state set-status run-a "finished"
  run state get run-a .status
  assert_output "active"
}

@test "list reports every run with its status" {
  bash "$SKILLS_DIR/dld-run/scripts/create-run.sh" --slug "run-b" --title "Run B" >/dev/null
  state set-status run-b paused

  run state list
  assert_success
  assert_line "run-a active"
  assert_line "run-b paused"
}

@test "list is empty when no runs exist" {
  rm -rf .dld
  run state list
  assert_success
  assert_output ""
}

@test "active prints only active runs" {
  bash "$SKILLS_DIR/dld-run/scripts/create-run.sh" --slug "run-b" --title "Run B" >/dev/null
  state set-status run-b paused

  run state active
  assert_success
  assert_output "run-a"
}

@test "active prints nothing when all runs are terminal" {
  state set-status run-a complete
  run state active
  assert_success
  assert_output ""
}

@test "append-event writes one compact line per event" {
  event run-a item-started --data '{"item":1}'
  event run-a item-accepted --data '{"item":1}'

  run jq -s 'length' .dld/runs/run-a/events.jsonl
  assert_output "3"
}

@test "append-event merges data fields alongside timestamp and type" {
  event run-a item-blocked --data '{"item":2,"reason":"tests failed"}'

  run jq -r 'select(.type == "item-blocked") | "\(.item) \(.reason)"' .dld/runs/run-a/events.jsonl
  assert_output "2 tests failed"
}

@test "append-event stamps every event with a timestamp" {
  event run-a ping
  run jq -r 'select(.type == "ping") | .timestamp' .dld/runs/run-a/events.jsonl
  assert_output --regexp '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'
}

@test "append-event rejects non-object data" {
  run event run-a bad --data '"just a string"'
  assert_failure
  assert_output --partial "must be a JSON object"
}

@test "append-event fails for an unknown run" {
  run event nope ping
  assert_failure
  assert_output --partial "not found"
}

@test "append-event requires slug and type" {
  run event run-a
  assert_failure
  assert_output --partial "Usage"
}
