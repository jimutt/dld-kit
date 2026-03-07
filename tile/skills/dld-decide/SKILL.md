---
name: dld-decide
description: Record a single development decision. Collects context, rationale, and code references interactively.
compatibility: Requires bash. Scripts use BASH_SOURCE for path resolution.
---

# /dld-decide — Record a Decision

You are helping the developer record a development decision. This should be a focused, low-ceremony conversation — not an interrogation.

## Interaction style

Use the `AskUserQuestion` tool for all questions and prompts. This provides a structured input experience for the user rather than waiting for freeform replies.

## Script Paths

Shared scripts:
```
../dld-common/scripts/next-id.sh
../dld-common/scripts/regenerate-index.sh
../dld-common/scripts/update-status.sh
```

Skill-specific scripts:
```
scripts/create-decision.sh
```

## Prerequisites

Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.

## Read project context

1. Read `dld.config.yaml` to understand the project structure (flat vs namespaced, decisions directory, namespaces list)
2. Read `decisions/PRACTICES.md` if it exists — be aware of project conventions when helping structure the decision
3. For namespaced projects, also read `decisions/<namespace>/PRACTICES.md` if it exists for the relevant namespace

## Conversation flow

### 1. Collect the decision

If the user provided context with the skill invocation, use it. Otherwise ask:

> What decision are you recording? Tell me what you decided, why, and what code it affects.

Listen for:
- **What** was decided (the decision itself)
- **Why** (the rationale — what problem it solves, what alternatives were considered)
- **What it affects** (code areas, components, modules)

### 2. Ask clarifying questions (if needed)

Only ask follow-up questions if the rationale or scope is genuinely unclear. Maximum 3-5 questions total. Don't interrogate — if the developer gave enough context, move on.

Good reasons to ask:
- The rationale is missing or unclear
- There might be alternatives worth noting
- The scope of affected code isn't clear
- There are obvious consequences worth recording

### 3. Check for related decisions

Scan existing decision files for potential relationships:
- Decisions that reference the same code paths
- Decisions with overlapping tags
- Decisions that this one might supersede

If you find related decisions, mention them and ask whether this decision supersedes any of them.

### 4. Determine namespace (namespaced projects only)

If the project is namespaced, determine which namespace this decision belongs to. Infer from the code references if possible, otherwise ask.

### 5. Assign ID

Run the next-id script:
```bash
bash ../dld-common/scripts/next-id.sh
```

This outputs the next available ID (e.g., `DL-004`).

### 6. Create the decision record

Compose the markdown body with the relevant sections (Context, Decision, Rationale, Consequences). Omit sections that aren't relevant, but always include Context and Decision.

Then run the create-decision script:
```bash
bash scripts/create-decision.sh \
  --id "DL-NNN" \
  --title "Short descriptive title" \
  --namespace "billing" \
  --tags "tag1, tag2" \
  --supersedes "DL-003, DL-007" \
  --body "## Context

What prompted this decision.

## Decision

What was decided.

## Rationale

Why this choice.

## Consequences

What becomes easier or harder."
```

Flags `--namespace`, `--tags`, `--supersedes` are optional. The script creates the file with YAML frontmatter and the body content, and outputs the file path.

If this decision supersedes others, also update their status:
```bash
bash ../dld-common/scripts/update-status.sh DL-003 superseded
```

### 7. Regenerate INDEX.md

```bash
bash ../dld-common/scripts/regenerate-index.sh
```

### 8. Suggest next steps

> Decision **DL-NNN** recorded as `proposed`.
>
> Next steps:
> - `/dld-implement DL-NNN` — implement this decision
> - `/dld-decide` — record another decision
