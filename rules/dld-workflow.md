# DLD (Decision-Linked Development)

This project uses Decision-Linked Development. Decision records (DL-*.md) live in `decisions/records/`. High-level docs (INDEX.md, OVERVIEW.md, SNAPSHOT.md) live in `decisions/`.

## Rules

- When you encounter `@decision(DL-XXX)` annotations in code, use `/dld-lookup DL-XXX` to read the referenced decision BEFORE modifying the annotated code.
- ALWAYS look up and verify related decisions before modifying annotated code. Do not skip this step.
- NEVER modify code in a way that contradicts an existing decision without first confirming with the user. If the change requires breaking a previous decision, a new decision must be recorded (via `/dld-decide`) that explicitly supersedes the old one. If it only partially modifies a previous decision, record it as an amendment instead.
- Use `/dld-decide` to record new decisions
- Use `/dld-plan` to break down a feature into multiple grouped decisions
- Use `/dld-implement` to implement proposed decisions
- Use `/dld-goal` to execute a set of proposed decisions as a long-running run (durable state, verified per-item completion)
- Use `/dld-lookup` to query decisions by ID, tag, or code path
- Use `/dld-audit` to scan for drift between decisions and code
- Use `/dld-snapshot` to regenerate SNAPSHOT.md and OVERVIEW.md from the decision log
- Use `/dld-status` for a quick overview of the decision log state
- Use `/dld-adjust` to adjust or update existing decisions
- Use `/dld-retrofit` to generate decisions from an existing codebase
- Use `/dld-reindex` to resolve decision-ID collisions with the base branch (and open PRs) before rebasing
