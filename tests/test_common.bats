#!/usr/bin/env bats
# Tests for dld-common/scripts/common.sh

load 'test_helper/common'

setup() {
  setup_flat_project
  source "$SKILLS_DIR/dld-common/scripts/common.sh"
}

teardown() {
  teardown_project
}

# --- get_project_root ---

@test "get_project_root returns git root" {
  result="$(get_project_root)"
  assert_equal "$result" "$TEST_PROJECT"
}

# --- config_get ---

@test "config_get reads decisions_dir" {
  result="$(config_get decisions_dir)"
  assert_equal "$result" "decisions"
}

@test "config_get reads mode" {
  result="$(config_get mode)"
  assert_equal "$result" "flat"
}

@test "config_get reads annotation_prefix with quotes" {
  result="$(config_get annotation_prefix)"
  assert_equal "$result" "@decision"
}

@test "config_get returns empty for missing field" {
  # grep returns exit 1 when no match, so we use run to capture it
  run bash -c 'source "'"$SKILLS_DIR"'/dld-common/scripts/common.sh"; config_get nonexistent_field'
  # The command may fail (grep exit 1 under pipefail) or return empty — both are acceptable
  [[ "$output" == "" ]]
}

@test "config_get fails when no config file" {
  rm dld.config.yaml
  run config_get mode
  assert_failure
  assert_output --partial "dld.config.yaml not found"
}

@test "config_get handles double-quoted values" {
  cat > dld.config.yaml <<'YAML'
decisions_dir: "my-decisions"
mode: flat
YAML
  result="$(config_get decisions_dir)"
  assert_equal "$result" "my-decisions"
}

@test "config_get handles single-quoted values" {
  cat > dld.config.yaml <<'YAML'
decisions_dir: 'my-decisions'
mode: flat
YAML
  result="$(config_get decisions_dir)"
  assert_equal "$result" "my-decisions"
}

# --- get_decisions_dir ---

@test "get_decisions_dir returns absolute path" {
  result="$(get_decisions_dir)"
  assert_equal "$result" "$TEST_PROJECT/decisions"
}

# --- get_records_dir ---

@test "get_records_dir returns records subdirectory" {
  result="$(get_records_dir)"
  assert_equal "$result" "$TEST_PROJECT/decisions/records"
}

# --- get_mode ---

@test "get_mode returns flat for flat project" {
  result="$(get_mode)"
  assert_equal "$result" "flat"
}

@test "get_mode returns namespaced for namespaced project" {
  cat > dld.config.yaml <<'YAML'
decisions_dir: decisions
mode: namespaced
namespaces:
  - billing
  - auth
YAML
  result="$(get_mode)"
  assert_equal "$result" "namespaced"
}

# --- get_namespaces ---

@test "get_namespaces returns namespace list" {
  cat > dld.config.yaml <<'YAML'
decisions_dir: decisions
mode: namespaced
namespaces:
  - billing
  - auth
  - shared
YAML
  run get_namespaces
  assert_success
  assert_line --index 0 "billing"
  assert_line --index 1 "auth"
  assert_line --index 2 "shared"
}

@test "get_namespaces returns nothing for flat project" {
  run get_namespaces
  assert_success
  assert_output ""
}
