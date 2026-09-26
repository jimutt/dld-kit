---
name: dld-common
description: The dld CLI shared by the DLD skills. Not intended for direct invocation — the other DLD skills run it.
internal: true
compatibility: Requires Node.js 20+ and git.
---

# DLD Common

This skill ships `scripts/dld.mjs`, the bundled `dld` command-line tool the other DLD skills run for mechanical operations: assigning IDs, creating records, updating status, regenerating the index, scanning annotations, and reindexing. Do not invoke this skill directly.

Run `node scripts/dld.mjs --help` from this skill's directory to list the commands.
