#!/usr/bin/env bats
# Tests for annotation scripts:
#   dld-audit/scripts/find-annotations.sh
#   dld-implement/scripts/verify-annotations.sh

load 'test_helper/common'

setup() {
  setup_flat_project
}

teardown() {
  teardown_project
}

# --- find-annotations.sh ---

@test "find-annotations finds annotation in source file" {
  mkdir -p src
  echo '// @decision(DL-001)' > src/main.ts
  git add -A && git commit -m "add" --quiet

  run bash "$SKILLS_DIR/dld-audit/scripts/find-annotations.sh"
  assert_success
  assert_output --partial "src/main.ts"
  assert_output --partial "DL-001"
}

@test "find-annotations returns empty with no annotations" {
  mkdir -p src
  echo 'console.log("hello")' > src/main.ts
  git add -A && git commit -m "add" --quiet

  run bash "$SKILLS_DIR/dld-audit/scripts/find-annotations.sh"
  assert_success
  assert_output ""
}

@test "find-annotations finds multiple annotations in one file" {
  mkdir -p src
  cat > src/main.ts <<'EOF'
// @decision(DL-001)
function foo() {}

// @decision(DL-002)
function bar() {}
EOF
  git add -A && git commit -m "add" --quiet

  run bash "$SKILLS_DIR/dld-audit/scripts/find-annotations.sh"
  assert_success
  assert_output --partial "DL-001"
  assert_output --partial "DL-002"
}

@test "find-annotations excludes node_modules" {
  mkdir -p node_modules/pkg
  echo '// @decision(DL-001)' > node_modules/pkg/index.js
  git add -A && git commit -m "add" --quiet

  run bash "$SKILLS_DIR/dld-audit/scripts/find-annotations.sh"
  assert_success
  assert_output ""
}

@test "find-annotations excludes decisions directory" {
  create_decision "DL-001" "accepted"
  git add -A && git commit -m "add" --quiet

  run bash "$SKILLS_DIR/dld-audit/scripts/find-annotations.sh"
  assert_success
  # Decision files contain "id: DL-001" but not the annotation pattern, so this
  # should be empty regardless. The exclusion matters when decision docs mention
  # the annotation pattern in prose.
  assert_output ""
}

@test "find-annotations outputs relative paths" {
  mkdir -p src/deep/nested
  echo '// @decision(DL-005)' > src/deep/nested/file.py
  git add -A && git commit -m "add" --quiet

  run bash "$SKILLS_DIR/dld-audit/scripts/find-annotations.sh"
  assert_success
  assert_output --partial "src/deep/nested/file.py"
  # Should NOT contain the absolute path
  refute_output --partial "$TEST_PROJECT/src"
}

# --- verify-annotations.sh ---

@test "verify-annotations succeeds when annotation exists" {
  mkdir -p src
  echo '// @decision(DL-001)' > src/main.ts

  run bash "$SKILLS_DIR/dld-implement/scripts/verify-annotations.sh" DL-001
  assert_success
  assert_output --partial "All decisions have code annotations"
}

@test "verify-annotations fails when annotation missing" {
  mkdir -p src
  echo 'console.log("hello")' > src/main.ts

  run bash "$SKILLS_DIR/dld-implement/scripts/verify-annotations.sh" DL-001
  assert_failure
  assert_output --partial "MISSING"
  assert_output --partial "DL-001"
}

@test "verify-annotations checks multiple IDs" {
  mkdir -p src
  echo '// @decision(DL-001)' > src/a.ts
  echo '// @decision(DL-002)' > src/b.ts

  run bash "$SKILLS_DIR/dld-implement/scripts/verify-annotations.sh" DL-001 DL-002
  assert_success
}

@test "verify-annotations reports all missing IDs" {
  mkdir -p src
  echo '// @decision(DL-001)' > src/a.ts

  run bash "$SKILLS_DIR/dld-implement/scripts/verify-annotations.sh" DL-001 DL-002 DL-003
  assert_failure
  assert_output --partial "DL-002"
  assert_output --partial "DL-003"
}

@test "verify-annotations fails with no arguments" {
  run bash "$SKILLS_DIR/dld-implement/scripts/verify-annotations.sh"
  assert_failure
}
