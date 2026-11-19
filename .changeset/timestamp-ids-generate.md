---
"dld-kit": minor
---

Create timestamp decision IDs. Set `id_format: timestamp` in `dld.config.yaml` and `dld next-id` gives IDs such as `DL-T1k3m9z2p7xq4`, which do not clash between branches; `sequential` stays the default. `/dld-reindex` renames colliding IDs to new IDs in the configured form.
