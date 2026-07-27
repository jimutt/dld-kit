#!/usr/bin/env bash
# Initializes the git repository the DLD scripts need. common.sh resolves the
# project root with `git rev-parse --show-toplevel`, so the scripts fail outside
# a repo. Run once, from the workspace root, before starting the task.
set -euo pipefail

git init -q -b main
git config user.email "test@example.com"
git config user.name "Test User"
git add -A
git commit -q -m "Initial fixture state"

echo "Fixture repository initialized at $(git rev-parse --show-toplevel)"
