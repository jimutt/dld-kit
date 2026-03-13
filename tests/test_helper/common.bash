#!/usr/bin/env bash
# Shared test helper — sets up a temporary git repo with dld.config.yaml

load 'test_helper/bats-support/load'
load 'test_helper/bats-assert/load'

# Path to the skills scripts (tessl version — canonical source)
SKILLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/skills"

# Create a temporary git repo with a flat dld config
setup_flat_project() {
  TEST_PROJECT="$(mktemp -d)"
  cd "$TEST_PROJECT"
  git init --quiet
  git config user.email "test@test.com"
  git config user.name "Test"
  git commit --allow-empty -m "init" --quiet

  cat > dld.config.yaml <<'YAML'
decisions_dir: decisions
mode: flat
annotation_prefix: '@decision'
YAML

  mkdir -p decisions/records
}

# Create a temporary git repo with a namespaced dld config
setup_namespaced_project() {
  TEST_PROJECT="$(mktemp -d)"
  cd "$TEST_PROJECT"
  git init --quiet
  git config user.email "test@test.com"
  git config user.name "Test"
  git commit --allow-empty -m "init" --quiet

  cat > dld.config.yaml <<'YAML'
decisions_dir: decisions
mode: namespaced
namespaces:
  - billing
  - auth
  - shared
annotation_prefix: '@decision'
YAML

  mkdir -p decisions/records/{billing,auth,shared}
}

# Create a minimal decision file
# Usage: create_decision <id> <status> [namespace]
create_decision() {
  local id="$1"
  local status="$2"
  local namespace="${3:-}"
  local title="${4:-Test decision $id}"

  local dir="decisions/records"
  if [[ -n "$namespace" ]]; then
    dir="decisions/records/$namespace"
    mkdir -p "$dir"
  fi

  local ns_line=""
  if [[ -n "$namespace" ]]; then
    ns_line="namespace: $namespace"
  fi

  cat > "$dir/$id.md" <<EOF
---
id: $id
title: "$title"
timestamp: 2026-01-15T10:00:00Z
status: $status
supersedes: []
${ns_line:+$ns_line
}tags: [test, example]
references: []
---

## Context
Test context for $id.

## Decision
Test decision content for $id.
EOF
}

teardown_project() {
  if [[ -n "${TEST_PROJECT:-}" && -d "$TEST_PROJECT" ]]; then
    rm -rf "$TEST_PROJECT"
  fi
}
