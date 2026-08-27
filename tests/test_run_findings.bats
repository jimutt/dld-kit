#!/usr/bin/env bats
# Tests for dld-run findings: add-finding.sh, get-findings.sh

load 'test_helper/common'

setup() {
  setup_flat_project
  bash "$SKILLS_DIR/dld-run/scripts/create-run.sh" --slug "findings-test" --title "Findings test" >/dev/null
}

teardown() {
  teardown_project
}

add_finding() { bash "$SKILLS_DIR/dld-run/scripts/add-finding.sh" "$@"; }
get_findings() { bash "$SKILLS_DIR/dld-run/scripts/get-findings.sh" "$@"; }

@test "add-finding creates the log with a header on first use" {
  add_finding findings-test --item 1 --decisions DL-001 --note "The config parser ignores empty sections."
  [ -f "$TEST_PROJECT/.dld/runs/findings-test/findings.md" ]
  run cat "$TEST_PROJECT/.dld/runs/findings-test/findings.md"
  [[ "$output" == *"# Findings — findings-test"* ]]
  [[ "$output" == *"**Item 1**"* ]]
  [[ "$output" == *"The config parser ignores empty sections."* ]]
}

@test "add-finding appends without rewriting previous entries" {
  add_finding findings-test --item 1 --decisions DL-001 --note "First finding."
  add_finding findings-test --item 2 --decisions DL-002 --note "Second finding."
  run cat "$TEST_PROJECT/.dld/runs/findings-test/findings.md"
  [[ "$output" == *"First finding."* ]]
  [[ "$output" == *"Second finding."* ]]
  # Second finding comes after the first
  local first_pos second_pos
  first_pos=$(grep -n "First finding" "$TEST_PROJECT/.dld/runs/findings-test/findings.md" | cut -d: -f1)
  second_pos=$(grep -n "Second finding" "$TEST_PROJECT/.dld/runs/findings-test/findings.md" | cut -d: -f1)
  [ "$first_pos" -lt "$second_pos" ]
}

@test "add-finding requires --item and --note" {
  run add_finding findings-test --decisions DL-001 --note "test"
  [ "$status" -eq 1 ]
  [[ "$output" == *"--item is required"* ]]

  run add_finding findings-test --item 1
  [ "$status" -eq 1 ]
  [[ "$output" == *"--note is required"* ]]
}

@test "add-finding rejects unknown options" {
  run add_finding findings-test --item 1 --note "test" --bogus
  [ "$status" -eq 1 ]
  [[ "$output" == *"Unknown option"* ]]
}

@test "get-findings prints the full log" {
  add_finding findings-test --item 1 --decisions DL-001 --note "Test note."
  run get_findings findings-test
  [ "$status" -eq 0 ]
  [[ "$output" == *"Test note."* ]]
}

@test "get-findings --count returns the number of findings" {
  add_finding findings-test --item 1 --decisions DL-001 --note "One."
  add_finding findings-test --item 2 --decisions DL-002 --note "Two."
  add_finding findings-test --item 3 --decisions DL-003 --note "Three."
  run get_findings findings-test --count
  [ "$output" = "3" ]
}

@test "get-findings on a run with no findings exits 0 silently" {
  run get_findings findings-test
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "get-findings --count on a run with no findings prints 0" {
  run get_findings findings-test --count
  [ "$output" = "0" ]
}

@test "add-finding fails on a nonexistent run" {
  run add_finding ghost-run --item 1 --note "test"
  [ "$status" -eq 1 ]
  [[ "$output" == *"not found"* ]]
}
