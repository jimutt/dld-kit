---
name: dld-lookup
description: Look up decisions by ID, tag, code path, or keyword. IMPORTANT — use this proactively whenever you encounter `@decision` annotations in code you are about to read or modify.
user_invocable: true
---

# /dld-lookup — Look Up Decisions

You are looking up decision records. This skill is used in two ways:
1. **Proactively by you (the AI agent)** — whenever you encounter `@decision(DL-XXX)` annotations in code you're reading or about to modify, look up the decision to understand the rationale before proceeding. This is not optional.
2. **On request by the developer** — to query decisions by ID, tag, code path, or keyword.

## Prerequisites

Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.

Read `dld.config.yaml` to understand the project structure (flat vs namespaced, decisions directory). The decisions directory path can be resolved by reading the `decisions_dir` field from `dld.config.yaml`. Decision records (DL-*.md) live in the `records/` subdirectory under the decisions directory.

## Query modes

Parse the user's input to determine the query type:

### By ID: `/dld-lookup DL-047`

Find and read the decision file `DL-047.md`. Search the records subdirectory (`decisions/records/`, including namespace subdirectories) for the file.

Display the full decision record.

### By tag: `/dld-lookup tag:payment-gateway`

Scan all decision files and find those with the matching tag in their YAML frontmatter `tags` field.

Display a summary table, then offer to show full details for any specific decision:

```
Found 3 decisions tagged `payment-gateway`:

| ID | Title | Status |
|----|-------|--------|
| DL-045 | Payment gateway retry strategy | accepted |
| DL-046 | Idempotency key format | proposed |
| DL-047 | Gateway timeout handling | proposed |

Would you like to see the full details for any of these?
```

### By code path: `/dld-lookup path:src/billing/vat.ts`

Scan all decision files and find those with a matching `path` in their `references` field. Match both exact paths and partial paths (e.g., `vat.ts` should match `src/billing/vat.ts`).

Display results the same way as tag lookup.

### By keyword: `/dld-lookup <search terms>`

If the input doesn't match the `DL-NNN`, `tag:`, or `path:` patterns, treat it as a keyword search. Search across:
- Decision titles
- Decision body content (Context, Decision, Rationale, Consequences sections)
- Tags

Display results the same way as tag lookup.

## Proactive usage (encountering `@decision` annotations)

When you encounter `@decision(DL-XXX)` in code — whether you are reading, modifying, or reviewing it — you MUST look up the referenced decision before proceeding. This applies to all interactions with annotated code, not just when explicitly asked.

After reading the decision:

1. **Understand** the rationale behind the annotated code
2. **Assess** whether your planned changes are compatible with the decision
3. **If they conflict** — stop and inform the user. Explain the conflict and suggest recording a new decision via `/dld-decide` that supersedes the existing one. Do not silently modify code in a way that contradicts an active decision.
4. **If they're compatible** — proceed with the modification

This is the core DLD feedback loop — `@decision` annotations are mechanical triggers that ensure design rationale is consulted before code is changed.
