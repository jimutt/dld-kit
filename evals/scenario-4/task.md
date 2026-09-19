# Update the Orders Schema Decision Record

## Background

Your team recently finalized the data persistence approach for the orders service and recorded it as decision DL-001 in the project's decision log. Before kicking off implementation, the tech lead reviewed the record and wants it tightened up: the section about an alternative approach that was evaluated during design is now considered noise — the team wants the record to stand on its own as a forward-looking document, not a record of deliberation.

The tech lead also wants the title to be more precise. The current title is broad; the decision is specifically about the schema design for the `orders` table, so the title should reflect that.

The decision file is at `decisions/records/DL-001.md`. The project uses a flat DLD layout with `dld.config.yaml` at the root. Scripts for managing the decision log are in `scripts/dld-common/`.

## Setup

Before starting, initialize the git repository by running:

```bash
bash setup.sh
```

This is required for the DLD scripts to resolve the project root.

## What to do

1. Remove the section about JSON columns from `decisions/records/DL-001.md`.
2. Update the decision title in the frontmatter to: `Relational Schema for Orders Table`.
3. Regenerate the decision index so it reflects the updated title.

Produce the updated `decisions/records/DL-001.md` and the regenerated `decisions/INDEX.md`.
