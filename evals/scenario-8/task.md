# Implement Three Pending Decisions

## Background

You are working on a Python service that manages user accounts. The team uses Decision-Linked Development (DLD) to track architectural and implementation choices. Three decisions have been written and are sitting in `proposed` status, waiting to be turned into code.

The decisions live in `decisions/records/`. The project is in flat mode — all records are in one directory. The DLD scripts you'll need are already available:

- `dld-common/scripts/update-status.sh` — update a decision's status
- `dld-common/scripts/regenerate-index.sh` — regenerate `decisions/INDEX.md`
- `scripts/verify-annotations.sh` — check that every implemented decision has an `@decision` annotation

The three decisions cover different aspects of the service: the core user record structure, associated data rules, and application observability. Read each decision record carefully before implementing to understand what it specifies.

## Your Task

Implement the three proposed decisions (`DL-001`, `DL-002`, `DL-003`) by completing the stub files `src/models.py` and `src/logging_config.py`. Keep all code files under 50 lines.

After implementing:

1. Add `@decision(DL-NNN)` annotations in the source files at the appropriate declaration level (functions, classes, or dataclass definitions).
2. Update the `references` field in each decision record's YAML frontmatter to point to the files and symbols you annotated.
3. Update each decision's status from `proposed` to `accepted` using `dld-common/scripts/update-status.sh`.
4. Run `scripts/verify-annotations.sh DL-001 DL-002 DL-003` to confirm every decision has at least one annotation.
5. Regenerate `decisions/INDEX.md` using `dld-common/scripts/regenerate-index.sh`.

Write a `steps.md` file at the project root explaining:
- Which decisions you chose to implement together and which separately, and why.
- Any small refinements you made to a decision record during implementation (specific values, edge cases).

## Output Files

- `src/models.py` — completed implementation
- `src/logging_config.py` — completed implementation
- `decisions/records/DL-001.md` — updated frontmatter (`references`, `status: accepted`)
- `decisions/records/DL-002.md` — updated frontmatter (`references`, `status: accepted`)
- `decisions/records/DL-003.md` — updated frontmatter (`references`, `status: accepted`)
- `decisions/INDEX.md` — regenerated
- `steps.md` — implementation notes
