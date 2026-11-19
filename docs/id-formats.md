# Decision ID formats

A project creates decision IDs in one of two forms. `id_format` in `dld.config.yaml` chooses which.

| | `sequential` (default) | `timestamp` |
|---|---|---|
| Looks like | `DL-001`, `DL-002`, `DL-1000` | `DL-T1k3m9z2p7xq4` |
| Next ID | One more than the highest number in the log | The current time in seconds plus 25 random bits |
| Two branches add a decision | Both pick the same ID; one runs `/dld-reindex` | The IDs differ; nothing to do |
| Reading it | Short, easy to say and remember | Long and opaque |
| Needs | Any dld-kit | dld-kit 1.1 or newer for every collaborator |

## Which to choose

Stay with **sequential** when one person, or a few people who rarely overlap, record decisions. A clash now and then costs one `/dld-reindex` run, and `DL-047` is pleasant to talk about.

Choose **timestamp** when several people or agents record decisions at the same time and the reindex runs have become routine. Each clash renames a record and rewrites every annotation and reference to it; timestamp IDs remove that work, at the price of IDs nobody will say aloud. Titles are in `INDEX.md`, and the date of a decision is in its record's `timestamp` field, so the ID does not need to carry either.

Both forms are always valid, in every log. `id_format` only decides what new IDs look like.

## What a timestamp ID is made of

`DL-T`, then 12 characters of lower-case Crockford base32 (`0123456789abcdefghjkmnpqrstvwxyz`, which leaves out `i`, `l`, `o` and `u`):

- 7 characters: the creation time in whole Unix seconds.
- 5 characters: 25 random bits.

Two IDs clash only if they are created in the same second with the same random bits, a chance of 1 in 33 million for a pair created in the same second. If it ever happens across branches, `/dld-reindex` finds and repairs it like any other collision.

IDs sort by creation time as plain text. When several are created within one second, each takes the time of the newest one plus a second, so a plan's decisions keep their order. The time in an ID therefore runs a little ahead of the clock during a burst, never more than 60 seconds.

Only the exact spelling is the ID. `DL-T1K3M9Z2P7XQ4` in upper case is not the same ID, is not an annotation, and the tools say so. Copy IDs; don't retype them.

## Starting a project with timestamp IDs

```bash
npx dld-kit init --id-format timestamp
```

Or choose timestamp IDs when `/dld-init` asks (`npx dld-kit init` does not ask; the flag is how you choose there). Either writes:

```yaml
id_format: timestamp
min_dld_version: 1.1.0
```

## Switching an existing project

1. **Upgrade every collaborator first.** dld-kit 1.0 does not see timestamp records at all: its index leaves them out and its audit skips their annotations. Update the skills in the repository (`npx dld-kit@latest update`) or each person's plugin, and merge that before anything else.
2. Add the two lines above to `dld.config.yaml` and merge the change.
3. Carry on. Existing `DL-NNN` records, annotations and references stay as they are. New decisions get timestamp IDs.

The log then holds both forms. Lists put sequential IDs first, by number, then timestamp IDs. That is a convention, not strict creation order: a branch opened before the switch can still bring in a sequential ID later.

Branches opened before the switch can still collide on their sequential IDs. `/dld-reindex` resolves that as before, and gives the renamed records timestamp IDs.

To switch back, set `id_format: sequential` or remove the key, and keep `min_dld_version`: the log still holds timestamp records. Nothing is renamed in either direction.

## `min_dld_version`

`min_dld_version` makes a dld-kit older than the stated version stop with a message telling the user to update, instead of working on a log it does not fully understand. dld-kit 1.0 does not know the key and only warns about it, which is why step 1 above matters. From 1.1 on it is enforced, so a later format change can be protected by raising it. See [project configuration](framework/project-configuration.md#minimum-version).

## File names

A record's file is always `<id>.md`, so its path can be built from its ID: `DL-T1k3m9z2p7xq4` is in `DL-T1k3m9z2p7xq4.md`. Names of the form `<id>--<text>.md` are reserved for a possible readable suffix later; today such a file is not read as a record and `regenerate-index` warns about it.
