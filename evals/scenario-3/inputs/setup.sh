#!/usr/bin/env bash
# Initialize a minimal git repository so DLD audit scripts work correctly.
# Run this once before starting the audit.
set -euo pipefail

git init -q
git config user.email "dev@example.com"
git config user.name "Developer"
git add -A
git commit -q -m "Initial project state"
echo "Git repository initialized."
