# DLD (Decision-Linked Development)

This project uses Decision-Linked Development. Decision records (DL-*.md) live in the `records/` subdirectory of the decisions directory set in `dld.config.yaml` (`decisions/` by default). High-level docs (INDEX.md, OVERVIEW.md, SNAPSHOT.md) live in the decisions directory.

## Rules

- When you encounter `@decision(DL-XXX)` annotations in code, read the referenced decision with the dld-lookup skill BEFORE modifying the annotated code.
- ALWAYS look up and verify related decisions before modifying annotated code. Do not skip this step.
- NEVER modify code in a way that contradicts an existing decision without first confirming with the user. If the change requires breaking a previous decision, a new decision must be recorded (with the dld-decide skill) that explicitly supersedes the old one. If it only partially modifies a previous decision, record it as an amendment instead.

## Skills

- dld-decide: record a new decision
- dld-plan: break down a feature into multiple grouped decisions
- dld-implement: implement proposed decisions
- dld-lookup: query decisions by ID, tag, or code path
- dld-adjust: adjust or update existing decisions
- dld-audit: scan for drift between decisions and code
- dld-snapshot: regenerate SNAPSHOT.md and OVERVIEW.md from the decision log
- dld-status: a quick overview of the decision log state
- dld-retrofit: generate decisions from an existing codebase
- dld-reindex: resolve decision-ID collisions with the base branch (and open PRs) before rebasing
