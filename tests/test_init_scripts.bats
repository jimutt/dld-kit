#!/usr/bin/env bats
# Tests for dld-init scripts:
#   create-config.sh, create-directories.sh, create-empty-index.sh

load 'test_helper/common'

setup() {
  # Bare git repo without dld config
  TEST_PROJECT="$(mktemp -d)"
  cd "$TEST_PROJECT"
  git init --quiet
  git config user.email "test@test.com"
  git config user.name "Test"
  git commit --allow-empty -m "init" --quiet
}

teardown() {
  teardown_project
}

# --- create-config.sh ---

@test "create-config creates flat config" {
  run bash "$SKILLS_DIR/dld-init/scripts/create-config.sh" flat
  assert_success

  [[ -f dld.config.yaml ]]
  run cat dld.config.yaml
  assert_output --partial "mode: flat"
  assert_output --partial "decisions_dir: decisions"
  assert_output --partial "annotation_prefix:"
  refute_output --partial "namespaces:"
}

@test "create-config creates namespaced config" {
  run bash "$SKILLS_DIR/dld-init/scripts/create-config.sh" namespaced billing auth
  assert_success

  run cat dld.config.yaml
  assert_output --partial "mode: namespaced"
  assert_output --partial "namespaces:"
  assert_output --partial "  - billing"
  assert_output --partial "  - auth"
}

@test "create-config rejects invalid mode" {
  run bash "$SKILLS_DIR/dld-init/scripts/create-config.sh" invalid
  assert_failure
  assert_output --partial "must be 'flat' or 'namespaced'"
}

@test "create-config rejects namespaced without namespaces" {
  run bash "$SKILLS_DIR/dld-init/scripts/create-config.sh" namespaced
  assert_failure
  assert_output --partial "requires at least one namespace"
}

@test "create-config fails if config already exists" {
  echo "mode: flat" > dld.config.yaml
  run bash "$SKILLS_DIR/dld-init/scripts/create-config.sh" flat
  assert_failure
  assert_output --partial "already exists"
}

# --- create-directories.sh ---

@test "create-directories creates flat structure" {
  bash "$SKILLS_DIR/dld-init/scripts/create-config.sh" flat
  run bash "$SKILLS_DIR/dld-init/scripts/create-directories.sh"
  assert_success

  [[ -d decisions ]]
  [[ -d decisions/records ]]
}

@test "create-directories creates namespaced structure" {
  bash "$SKILLS_DIR/dld-init/scripts/create-config.sh" namespaced billing auth
  run bash "$SKILLS_DIR/dld-init/scripts/create-directories.sh"
  assert_success

  [[ -d decisions/records/billing ]]
  [[ -d decisions/records/auth ]]
  [[ -f decisions/records/billing/.gitkeep ]]
  [[ -f decisions/records/auth/.gitkeep ]]
}

# --- create-empty-index.sh ---

@test "create-empty-index creates flat index" {
  bash "$SKILLS_DIR/dld-init/scripts/create-config.sh" flat
  mkdir -p decisions
  run bash "$SKILLS_DIR/dld-init/scripts/create-empty-index.sh"
  assert_success

  [[ -f decisions/INDEX.md ]]
  run cat decisions/INDEX.md
  assert_output --partial "# Decision Log"
  assert_output --partial "| ID | Title | Status | Tags |"
  refute_output --partial "Namespace"
}

@test "create-empty-index creates namespaced index" {
  bash "$SKILLS_DIR/dld-init/scripts/create-config.sh" namespaced billing auth
  mkdir -p decisions
  run bash "$SKILLS_DIR/dld-init/scripts/create-empty-index.sh"
  assert_success

  run cat decisions/INDEX.md
  assert_output --partial "| ID | Title | Status | Namespace | Tags |"
}
