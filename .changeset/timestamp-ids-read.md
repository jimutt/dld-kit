---
"dld-kit": minor
---

Read a second decision ID form, the timestamp ID (`DL-T` plus 12 lower-case Crockford base32 characters, e.g. `DL-T1k3m9z2p7xq4`), everywhere a decision ID is accepted: record files, annotations, mentions, `amends` and `supersedes`, reindex renames and command arguments. Logs can mix both forms; sequential IDs sort first. File names of the form `<id>--<text>.md` are now reserved and reported by `regenerate-index`.
