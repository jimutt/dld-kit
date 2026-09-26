---
name: dld-common
description: Shared utility scripts for DLD skills. Not intended for direct invocation — used internally by other DLD skills.
internal: true
compatibility: Requires bash. Scripts use BASH_SOURCE for path resolution.
---

# DLD Common Utilities

This skill contains shared scripts used by other DLD skills. Do not invoke directly.

## Scripts

- `{{script dld-common/scripts/common.sh}}` — shared helper functions (config parsing, decisions directory resolution)
- `{{script dld-common/scripts/next-id.sh}}` — outputs the next available decision ID (e.g., `DL-004`)
- `{{script dld-common/scripts/regenerate-index.sh}}` — regenerates `decisions/INDEX.md` from all decision records
- `{{script dld-common/scripts/update-status.sh}}` — updates a decision record's status field
