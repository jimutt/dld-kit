# Decision ID Collision Resolution

## Background

Your team uses Decision-Linked Development (DLD) to record architectural decisions as Markdown files in `decisions/records/`. IDs are assigned sequentially (DL-001, DL-002, etc.) and are globally unique across the project. Two engineers have been working in parallel on different features: one set of decisions landed on `main` while the other was being drafted on a feature branch. When the first batch merged, it claimed IDs that the feature branch had independently assigned to unrelated decisions — creating a collision.

The feature branch you are working on has `decisions/records/DL-004.md` and `decisions/records/DL-005.md`, and so does `main` — but they are completely different decisions that happen to share the same ID. Before this branch can be rebased onto `main`, the feature branch copies must be renumbered to the next available IDs. Without renumbering, `git rebase` will hit add/add conflicts before it can apply any meaningful changes.

The project includes a set of reindex scripts, installed at `.tessl/skills/dld-reindex/scripts/`, with shared utilities at `.tessl/skills/dld-common/scripts/`. The repository is already fully set up with the correct branch structure: you are on the feature branch with two local commits that introduce the colliding decisions.

**To initialize the repository fixture, first run:**

```bash
bash setup.sh
```

Then work from the resulting git repository in the same directory.

## What to Do

Run the dld-reindex workflow to resolve the ID collisions and produce a reindex commit ready for rebasing. Choose **rewrite only** (do not force-push — leave pushing for the developer).

When done, produce a file called `reindex-summary.md` in the current directory that documents:

- Which decision IDs were renamed and to what
- The squashed commit hash (from `git log -1 --oneline`)
- Whether the open-PR scan ran, and if it was skipped, the reason reported and what that means for the IDs you chose
- The next steps the developer needs to take before the branch can be merged

Do not run `git rebase` — leave that step for the developer.
