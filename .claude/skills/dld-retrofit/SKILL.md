---
name: dld-retrofit
description: Bootstrap DLD decisions from an existing codebase. Analyzes code to generate initial decision records and annotations.
user_invocable: true
---

# /dld-retrofit — Retrofit Decisions onto Existing Code

You are helping the developer bootstrap DLD in an existing codebase by generating decision records from what the code already does. The goal is **not** 100% decision coverage — it's to create enough scaffolding that the DLD workflow feels natural for future development.

## Script Paths

Shared scripts:
```
.claude/skills/dld-common/scripts/next-id.sh
.claude/skills/dld-common/scripts/regenerate-index.sh
.claude/skills/dld-decide/scripts/create-decision.sh
```

## Prerequisites

1. Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.
2. There should be existing application code in the repository. If the repo is empty or only has boilerplate, suggest `/dld-decide` or `/dld-plan` instead.

## Read project context

1. Read `dld.config.yaml` for project structure (flat vs namespaced, decisions directory)
2. Read `decisions/PRACTICES.md` if it exists
3. Check for any existing decisions — retrofit can be run alongside existing decisions

## Step 1: Analyze the codebase

Perform a broad analysis of the codebase:
- Identify the main components, modules, and domain areas
- Note the tech stack, frameworks, and key dependencies
- Identify architectural patterns in use (layered architecture, domain-driven modules, etc.)
- Look for non-obvious implementation choices — these are the best candidates for decisions

Present a brief summary to the user:

> **Codebase analysis:**
> - [Tech stack summary]
> - [N] main components/modules identified: [list]
> - [Notable patterns or architectural choices observed]

## Step 2: Determine scope

Ask the user:

> Would you like to retrofit the **entire codebase**, or focus on a **specific area**?

If a specific area, ask them to identify it (a directory, module, or domain concept). Narrow the analysis scope accordingly.

## Step 3: Choose granularity

Explain the two modes and ask the user to choose:

> **Broad mode** — Creates high-level decisions covering major features and components. Produces file-level references only (e.g., `path: src/billing/service.ts`). Good for getting started quickly with a general decision scaffold.
>
> **Detailed mode** — Creates finer-grained decisions covering specific behaviors and design choices. Produces method-level references and annotations (e.g., `symbol: calculateVAT`). Takes longer but creates richer traceability from the start.
>
> Which mode would you like to use?

## Step 4: Identify decisions

Based on the scope and granularity, analyze the code and identify candidate decisions. Focus on:

- **Architectural choices** — why the code is structured this way (module boundaries, layer patterns, data flow)
- **Non-obvious implementation details** — retry logic, caching strategies, validation approaches, error handling patterns
- **Domain rules** — business logic that encodes specific rules or policies
- **Technology choices** — framework selection, library usage, storage approach
- **Trade-offs** — places where the code chose one approach over alternatives

**Broad mode:** Aim for 1-2 decisions per major component or feature area. Each decision should cover a significant chunk of functionality.

**Detailed mode:** Aim for decisions wherever there's a meaningful "why" behind the code. Still don't try to cover everything — focus on the decisions a future developer (or AI agent) would most benefit from knowing about.

Present the proposed decisions as a numbered list:

> **Proposed decisions:**
> 1. **[Title]** — [one-line summary of what the decision covers]
>    - Affects: `src/path/to/code.ts`
> 2. **[Title]** — [one-line summary]
>    - Affects: `src/path/to/other.ts`, `src/path/to/related.ts`
> ...
>
> Want me to proceed with all of these, remove any, or adjust?

Let the user review and adjust the list before proceeding.

## Step 5: Generate decision records

For each approved decision:

1. Read the relevant code to understand what it does and infer the rationale
2. Write the decision record with Context, Decision, and Rationale sections. The **Context** should describe the problem the code solves. The **Decision** should describe what the code does. The **Rationale** should be your best inference of *why* — acknowledge when you're inferring rather than stating known facts (e.g., "likely chosen because..." or "this approach avoids...").
3. Include a Consequences section only when trade-offs are apparent from the code
4. Assign sequential IDs using the next-id script
5. Create each record using the create-decision script

```bash
ID=$(bash .claude/skills/dld-common/scripts/next-id.sh)
bash .claude/skills/dld-decide/scripts/create-decision.sh \
  --id "$ID" \
  --title "Title" \
  --tags "tag1, tag2" \
  --body "## Context
...

## Decision
...

## Rationale
..."
```

## Step 6: Add annotations and references

For each decision, add `@decision(DL-NNN)` annotations to the relevant code:

- **Broad mode:** Annotate at the file/module level — typically at the top of the file or on the main export/class.
- **Detailed mode:** Annotate at the function/method/class level where the decision is embodied.

Then update each decision record's `references` field directly in the YAML frontmatter with the annotated code paths and symbols.

## Step 7: Mark as accepted

Since the code already exists, these decisions go directly to `accepted` status:

```bash
bash .claude/skills/dld-common/scripts/update-status.sh DL-NNN accepted
```

Do this for each generated decision.

## Step 8: Regenerate INDEX.md

```bash
bash .claude/skills/dld-common/scripts/regenerate-index.sh
```

## Step 9: Summary and next steps

> **Retrofit complete:**
> - Created **N** decisions (DL-XXX through DL-YYY)
> - Added **M** `@decision` annotations across the codebase
> - Mode: [broad/detailed]
> - Scope: [entire codebase / specific area]
>
> These decisions capture the current state of the codebase — not every design choice, but enough to establish a working decision scaffold.
>
> Next steps:
> - Review the generated decisions for accuracy — especially the inferred rationale
> - `/dld-snapshot` — generate SNAPSHOT.md and OVERVIEW.md from the new decisions
> - `/dld-decide` — record new decisions as you make changes going forward
> - `/dld-retrofit` — run again on other areas if you scoped to a specific component
