---
name: dld-common
description: Shared utility scripts for DLD skills. Not intended for direct invocation — used internally by other DLD skills.
compatibility: Requires bash. Scripts use BASH_SOURCE for path resolution.
---

# DLD Common Utilities

This skill contains shared scripts used by other DLD skills. Do not invoke directly.

## Scripts

- `scripts/common.sh` — shared helper functions (config parsing, decisions directory resolution)
- `scripts/next-id.sh` — outputs the next available decision ID (e.g., `DL-004`)
- `scripts/regenerate-index.sh` — regenerates `decisions/INDEX.md` from all decision records
- `scripts/update-status.sh` — updates a decision record's status field
