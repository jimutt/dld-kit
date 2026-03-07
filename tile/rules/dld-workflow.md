# DLD (Decision-Linked Development)

This project uses Decision-Linked Development. Decisions are recorded in `decisions/` as individual markdown files.

- When you encounter `@decision(DL-XXX)` annotations in code, look up the referenced decision and read it BEFORE modifying the annotated code. Understand the rationale behind the decision.
- Use `/dld-decide` to record new decisions
- Use `/dld-implement` to implement proposed decisions
- Use `/dld-lookup` to query decisions by ID, tag, or code path
