#!/usr/bin/env bats
# Tests for dld-goal/scripts/create-run.sh

load 'test_helper/common'

setup() {
  setup_flat_project
}

teardown() {
  teardown_project
}

create_run() {
  bash "$SKILLS_DIR/dld-goal/scripts/create-run.sh" "$@"
}

@test "create-run scaffolds the run directory" {
  run create_run --slug "my-goal" --title "My goal"
  assert_success
  assert_output --partial ".dld/runs/my-goal"

  [ -f .dld/runs/my-goal/state.json ]
  [ -f .dld/runs/my-goal/contract.md ]
  [ -f .dld/runs/my-goal/events.jsonl ]
}

@test "create-run writes camelCase state with expected defaults" {
  create_run --slug "my-goal" --title "My goal"

  run jq -r '.schemaVersion, .slug, .title, .status, .review, .currentItem, (.items | length)' .dld/runs/my-goal/state.json
  assert_success
  assert_line --index 0 "1"
  assert_line --index 1 "my-goal"
  assert_line --index 2 "My goal"
  assert_line --index 3 "active"
  assert_line --index 4 "enabled"
  assert_line --index 5 "null"
  assert_line --index 6 "0"
}

@test "create-run records bounds" {
  create_run --slug "bounded" --title "Bounded" --max-items 5 --max-minutes 90

  run jq -r '.bounds.maxItems, .bounds.maxMinutes' .dld/runs/bounded/state.json
  assert_line --index 0 "5"
  assert_line --index 1 "90"
}

@test "create-run defaults bounds to zero (unbounded)" {
  create_run --slug "unbounded" --title "Unbounded"

  run jq -r '.bounds.maxItems, .bounds.maxMinutes' .dld/runs/unbounded/state.json
  assert_line --index 0 "0"
  assert_line --index 1 "0"
}

@test "create-run accepts a contract body on stdin" {
  printf '## Objective\n\nShip the thing.' | create_run --slug "with-body" --title "With body" --body-stdin

  run cat .dld/runs/with-body/contract.md
  assert_output --partial "Ship the thing."
  assert_output --partial "# Goal run: With body"
}

@test "create-run writes a placeholder when no body is given" {
  create_run --slug "no-body" --title "No body"

  run cat .dld/runs/no-body/contract.md
  assert_output --partial "_No objective recorded._"
}

@test "create-run appends a run-created event" {
  create_run --slug "evented" --title "Evented"

  run jq -r '.type, .title' .dld/runs/evented/events.jsonl
  assert_line --index 0 "run-created"
  assert_line --index 1 "Evented"
}

@test "create-run gitignores .dld/ by default" {
  create_run --slug "ignored" --title "Ignored"

  run grep -qxF ".dld/" .gitignore
  assert_success
}

@test "create-run does not duplicate an existing .dld/ gitignore entry" {
  printf '.DS_Store\n.dld/\n' > .gitignore
  create_run --slug "ignored" --title "Ignored"

  run grep -cxF ".dld/" .gitignore
  assert_output "1"
}

@test "create-run appends to a gitignore lacking a trailing newline" {
  printf '.DS_Store' > .gitignore
  create_run --slug "ignored" --title "Ignored"

  run grep -qxF ".DS_Store" .gitignore
  assert_success
  run grep -qxF ".dld/" .gitignore
  assert_success
}

@test "create-run skips gitignore when the project opts out" {
  echo "goal_run_artifacts: commit" >> dld.config.yaml
  create_run --slug "committed" --title "Committed"

  [ ! -f .gitignore ]
}

@test "create-run refuses an existing run" {
  create_run --slug "dupe" --title "Dupe"
  run create_run --slug "dupe" --title "Dupe again"
  assert_failure
  assert_output --partial "already exists"
}

@test "create-run rejects an invalid slug" {
  run create_run --slug "Not A Slug" --title "Bad"
  assert_failure
  assert_output --partial "invalid run slug"
}

@test "create-run rejects a non-numeric bound" {
  run create_run --slug "bad-bound" --title "Bad" --max-items "many"
  assert_failure
  assert_output --partial "non-negative integers"
}

@test "create-run rejects an invalid review value" {
  run create_run --slug "bad-review" --title "Bad" --review "maybe"
  assert_failure
  assert_output --partial "must be 'enabled' or 'disabled'"
}

@test "create-run requires slug and title" {
  run create_run --slug "only-slug"
  assert_failure
  assert_output --partial "required"
}
