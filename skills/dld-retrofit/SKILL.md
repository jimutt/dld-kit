---
name: dld-retrofit
description: Bootstrap DLD decisions from an existing codebase. Analyzes code to infer rationale, generates decision records, and adds `@decision` annotations.
compatibility: Requires bash and git. Scripts use BASH_SOURCE for path resolution.
---

# /dld-retrofit — Retrofit Decisions onto Existing Code

You are helping the developer bootstrap DLD in an existing codebase by generating decision records from what the code already does. The goal is **not** 100% decision coverage — it's to create enough scaffolding that the DLD workflow feels natural for future development.

## Interaction style

Use the `AskUserQuestion` tool for all questions and prompts. This provides a structured input experience for the user rather than waiting for freeform replies.

## Script Paths

Shared scripts:
```
../dld-common/scripts/next-id.sh
../dld-common/scripts/regenerate-index.sh
../dld-decide/scripts/create-decision.sh
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

### System-framing decisions (always include these first)

Before diving into implementation details, identify **foundational decisions that frame the system itself**. These establish the context that all other decisions hang on:

- **System purpose** — What is this service/application and why does it exist? What problem does it solve? (e.g., "Auth integration microservice bridging platform accounts to Firebase Auth")
- **Core domain model** — What are the key domain concepts and their relationships? (e.g., "Multi-provider account linking with one primary identity per provider")
- **Key integration boundaries** — What external systems does this interact with and how? (e.g., "Dual Firebase integration: Admin SDK for backend, REST API for OOB flows")

These framing decisions may not map to a single function — they often reference the application entry point, main service interface, or core domain model files. Without them, the projected OVERVIEW.md would read as a collection of implementation details with no narrative anchor.

Aim for 1-3 framing decisions depending on the system's complexity. Ask the user to help articulate these — they capture the kind of high-level context that's hardest to infer from code alone.

### Implementation-level decisions

Then identify decisions at the implementation level. Focus on:

- **Architectural choices** — why the code is structured this way (module boundaries, layer patterns, data flow)
- **Non-obvious implementation details** — retry logic, caching strategies, validation approaches, error handling patterns
- **Domain rules** — business logic that encodes specific rules or policies
- **Technology choices** — framework selection, library usage, storage approach
- **Trade-offs** — places where the code chose one approach over alternatives

**Broad mode:** Aim for 1-2 decisions per major component or feature area. Each decision should cover a significant chunk of functionality.

**Detailed mode:** Aim for decisions wherever there's a meaningful "why" behind the code. Still don't try to cover everything — focus on the decisions a future developer (or AI agent) would most benefit from knowing about.

**Ask when unsure:** If you encounter code that looks like a deliberate design choice but you can't confidently infer the rationale, ask the user. These are often the most valuable decisions to capture — the ones where the "why" isn't obvious from the code alone. For example:

> I see the order service retries with a 7-second delay and max 3 attempts. Is there a specific reason for these values, or is it a general resilience pattern?

Don't ask about everything — focus on cases where the implementation seems intentionally specific and the rationale would be lost without human input.

Present the proposed decisions as a numbered list, with framing decisions first:

> **Proposed decisions:**
>
> *System framing:*
> 1. **[System purpose/identity]** — [what this system is and why it exists]
>    - Affects: `src/Application.ts` (or equivalent entry point)
> 2. **[Core domain model]** — [key concepts and relationships]
>    - Affects: `src/models/Account.ts`, `src/models/Identity.ts`
>
> *Implementation decisions:*
> 3. **[Title]** — [one-line summary]
>    - Affects: `src/path/to/code.ts`
> 4. **[Title]** — [one-line summary]
>    - Affects: `src/path/to/other.ts`
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
ID=$(bash ../dld-common/scripts/next-id.sh)
printf "## Context\n\n...\n\n## Decision\n\n...\n\n## Rationale\n\n..." | bash ../dld-decide/scripts/create-decision.sh \
  --id "$ID" \
  --title "Title" \
  --tags "tag1, tag2" \
  --body-stdin
```

## Step 6: Add annotations and references

For each decision, add `@decision(DL-NNN)` annotations to the relevant code:

- **Broad mode:** Annotate at the file/module level — typically at the top of the file or on the main export/class.
- **Detailed mode:** Annotate at the function/method/class level where the decision is embodied.

Then update each decision record's `references` field directly in the YAML frontmatter with the annotated code paths and symbols.

## Step 7: Mark as accepted

Since the code already exists, these decisions go directly to `accepted` status:

```bash
bash ../dld-common/scripts/update-status.sh DL-NNN accepted
```

Do this for each generated decision.

## Step 8: Regenerate INDEX.md

```bash
bash ../dld-common/scripts/regenerate-index.sh
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
