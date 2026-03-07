---
name: dld-lookup
description: Look up decisions by ID, tag, code path, or keyword. Used by the agent when encountering @decision annotations.
user_invocable: true
---

# /dld-lookup — Look Up Decisions

You are looking up decision records. This skill serves two purposes:
1. The developer queries decisions manually
2. You (the AI agent) look up decisions when encountering `@decision(DL-XXX)` annotations in code before modifying annotated code

## Prerequisites

Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.

Read `dld.config.yaml` to understand the project structure (flat vs namespaced, decisions directory). The decisions directory path can be resolved by reading the `decisions_dir` field from `dld.config.yaml`.

## Query modes

Parse the user's input to determine the query type:

### By ID: `/dld-lookup DL-047`

Find and read the decision file `DL-047.md`. Search the decisions directory (and all subdirectories for namespaced projects) for the file.

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

## When used by the agent (encountering @decision annotations)

When you encounter `@decision(DL-XXX)` in code you're about to modify, use this skill to read the decision. After reading:

1. Understand the rationale behind the annotated code
2. Consider whether your planned changes conflict with or violate the decision
3. If they do, inform the user and suggest recording a new decision that supersedes the existing one via `/dld-decide`
4. If they don't, proceed with the modification

This is the core DLD feedback loop — decisions annotated in code trigger the agent to understand context before making changes.
