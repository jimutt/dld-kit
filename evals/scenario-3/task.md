# Decision Drift Audit

## Problem Description

Your team has been working on a Python API service for several months. The project uses Decision-Linked Development (DLD) to keep decision records in sync with the codebase. The `decisions/records/` folder has grown to four accepted decisions and the source code has accumulated several `@decision` annotations.

A code review process raised concerns that the decision log may have drifted from the actual code: some annotations might reference decisions that no longer exist, some decisions might point to files that were removed during a cleanup, and there may be relationships between decisions that were never formally recorded. No formal audit has been run since the project started.

Your task is to run a complete `/dld-audit` of this project and document all findings.

## Setup

Before starting, initialize the git repository by running:

```bash
bash setup.sh
```

This is required for the DLD scripts to function correctly.

## Output Specification

Produce an `audit-report.md` file in the working directory. The report must include:

- All drift issues found, organized by category (e.g., orphaned annotations, stale file references, missing relationship declarations)
- Any informational observations (not issues) worth noting
- A summary section with issue counts
- A note about the audit state update at the end
