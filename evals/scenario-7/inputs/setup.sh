#!/usr/bin/env bash
# Initialize the project git repository so DLD scripts can run.
set -euo pipefail
if [ ! -d .git ]; then
  git init -q
  git config user.email "dev@example.com"
  git config user.name "Developer"
  git add -A
  git commit -q -m "Initial project setup with DLD"
fi
echo "Project ready."
