# DLD (Decision-Linked Development)

This project uses Decision-Linked Development. Decisions are recorded in `decisions/` as individual markdown files.

- When you encounter `@decision(DL-XXX)` annotations in code, look up the referenced decision and read it BEFORE modifying the annotated code. Understand the rationale behind the decision.
- Use `/dld-decide` to record new decisions
- Use `/dld-plan` to break down a feature into multiple grouped decisions
- Use `/dld-implement` to implement proposed decisions
- Use `/dld-lookup` to query decisions by ID, tag, or code path
- Use `/dld-audit` to scan for drift between decisions and code
- Use `/dld-snapshot` to regenerate SNAPSHOT.md and OVERVIEW.md from the decision log
- Use `/dld-status` for a quick overview of the decision log state
- Use `/dld-retrofit` to generate decisions from an existing codebase
