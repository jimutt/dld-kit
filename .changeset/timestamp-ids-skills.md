---
"dld-kit": minor
---

Timestamp decision IDs are now offered when a project is set up: `npx dld-kit init --id-format timestamp`, or the question `/dld-init` asks. Both write `id_format: timestamp` and `min_dld_version`. The skills and the always-on rule describe both ID forms, `/dld-audit` reports problems with the log itself (an ID in more than one file, reserved file names, a timestamp ID dated ahead of the clock, a timestamp project without `min_dld_version`), and `docs/id-formats.md` explains how to choose and how to switch an existing project. Upgrade every collaborator's dld-kit before switching: 1.0 does not see timestamp records.
