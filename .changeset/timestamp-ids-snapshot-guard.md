---
"dld-kit": minor
---

`/dld-snapshot` change detection works with timestamp IDs: `.dld-state.yaml` stores the highest decision as an ID (a number written by 1.0 is still read), records changed but not yet committed count as modified, and a state file whose commit cannot be found now gives a full regeneration instead of an incremental one.

New `min_dld_version` key in `dld.config.yaml`: an older `dld` stops with a message telling the user to update, instead of working on a project it does not fully understand.
