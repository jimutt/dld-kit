---
name: dld-status
description: Quick overview of the decision log state — counts by status, recent decisions, and run tracking info.
user_invocable: true
---

# /dld-status — Decision Log Overview

You are generating a quick overview of the decision log state for the developer.

## Script Paths

This skill has no dedicated scripts. It reads decision files and state files directly:
- `dld.config.yaml` — project configuration (decisions directory, mode)
- `decisions/DL-*.md` — all decision records (scan YAML frontmatter for status, tags, timestamp, namespace)
- `decisions/.dld-state.yaml` — run tracking state for audit and snapshot (may not exist)

## Prerequisites

Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.

## Read project context

1. Read `dld.config.yaml` to understand the project structure (flat vs namespaced, decisions directory)
2. Read all decision files in the decisions directory to gather statistics

## Generate the overview

### 1. Count decisions by status

Scan all `DL-*.md` files in the decisions directory (and all subdirectories). Read the `status` field from each file's YAML frontmatter. Count:
- `proposed`
- `accepted`
- `deprecated`
- `superseded`

Present as:
```
## Decision Log Status

| Status | Count |
|--------|-------|
| proposed | 3 |
| accepted | 12 |
| deprecated | 2 |
| superseded | 1 |
| **Total** | **18** |
```

### 2. Recent decisions

Show the 5 most recent decisions (by timestamp), with ID, title, status:

```
## Recent Decisions

| ID | Title | Status | Date |
|----|-------|--------|------|
| DL-018 | ... | proposed | 2026-03-07 |
| DL-017 | ... | accepted | 2026-03-06 |
| ...
```

### 3. Decisions by grouping

**Namespaced projects:** Show decision counts per namespace.

```
## By Namespace

| Namespace | Total | Proposed | Accepted |
|-----------|-------|----------|----------|
| billing | 8 | 1 | 7 |
| auth | 5 | 2 | 3 |
| shared | 5 | 0 | 5 |
```

**All projects:** If there are tags in use, show the most active tags (those with the most decisions):

```
## Active Tags

| Tag | Decisions |
|-----|-----------|
| payment-gateway | 4 |
| auth-refactor | 3 |
```

### 4. Run tracking info

Read `decisions/.dld-state.yaml` if it exists. Report:
- Last audit run time and commit hash
- Last snapshot run time

If the file doesn't exist, note that no audits or snapshots have been run yet.

```
## Run History

- **Last audit:** 2026-03-06 at commit `a1b2c3d` (1 day ago)
- **Last snapshot:** 2026-03-05 (2 days ago, covers through DL-015)
```

Or:
```
## Run History

No audits or snapshots have been run yet. Use `/dld-audit` to check for drift.
```

### 5. Proposed decisions needing action

If there are any `proposed` decisions, list them as a call to action:

```
## Pending Implementation

These decisions are proposed but not yet implemented:
- **DL-016**: Rate limiting strategy
- **DL-017**: Cache invalidation approach
- **DL-018**: Error response format

Use `/dld-implement DL-NNN` to implement them.
```
