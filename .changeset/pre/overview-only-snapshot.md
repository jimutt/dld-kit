---
"dld-kit": minor
---

`/dld-snapshot` now generates only `OVERVIEW.md` (plus any `snapshot_artifacts` you define) and no longer writes `SNAPSHOT.md`. If your project has a `SNAPSHOT.md` from an earlier version, the next run offers to delete it; to keep generating a file by that name, add a `snapshot_artifacts` entry titled `SNAPSHOT.md` with your own prompt.
