# Retrofit Decision Records onto a Todo API

## Problem Description

A small Python REST API for managing to-do items has been growing organically for several months. The codebase now has a handful of clearly deliberate architectural choices — a particular storage backend, a validation library, a specific error response format, a REST interface — but none of these choices are documented anywhere. New contributors keep asking why certain things were done the way they were, and code reviews frequently relitigate decisions that were settled long ago.

The team has already set up DLD (Decision Log Documentation) in the repository. The `dld.config.yaml` file is present, the `decisions/` directory is initialized with an empty `INDEX.md`, and the helper scripts are available under `dld-common/scripts/` and `dld-decide/scripts/`. What's missing is the actual decision records — no one has sat down to document what was decided and why.

Your job is to retrofit DLD onto this codebase by analyzing the existing source code and generating decision records that capture the architectural choices already embedded in the code. The codebase lives under `src/`. Start with the highest-level architectural decisions and work downward.

## Output Specification

Analyze the source files under `src/` and produce decision records that capture the key architectural choices. After generating the records:

- Each decision file should be created under `decisions/records/` using the helper scripts
- Annotate the relevant source files with `@decision(DL-NNN)` comments
- Regenerate `decisions/INDEX.md` to reflect the new records

The final state should have:
- At least 3 decision records under `decisions/records/`
- `decisions/INDEX.md` updated to list all decisions
- `@decision` annotations added to the appropriate source files
