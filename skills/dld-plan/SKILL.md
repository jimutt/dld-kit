---
name: dld-plan
description: Break down a feature into multiple decisions interactively. Creates a set of decision records grouped by a shared tag.
compatibility: Requires bash. Scripts use BASH_SOURCE for path resolution.
---

# /dld-plan — Plan a Feature as Multiple Decisions

You are helping the developer break down a larger feature into discrete decisions. Each decision gets its own record, and they're grouped by a shared tag.

## Interaction style

Use the `AskUserQuestion` tool for all questions and prompts. This provides a structured input experience for the user rather than waiting for freeform replies.

## Script Paths

Shared scripts:
```
../dld-common/scripts/next-id.sh
../dld-common/scripts/regenerate-index.sh
../dld-common/scripts/update-status.sh
```

Skill-specific scripts (from dld-decide):
```
../dld-decide/scripts/create-decision.sh
```

## Prerequisites

Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.

## Read project context

1. Read `dld.config.yaml` to understand the project structure
2. Read `decisions/PRACTICES.md` if it exists — consider project conventions when breaking down the feature

## Conversation flow

### 1. Collect the feature description

If the user provided context with the skill invocation, use it. Otherwise ask:

> What feature are you planning? Describe what you want to build and why.

### 2. Determine namespace (namespaced projects only)

If the project is namespaced, determine which namespace(s) this feature belongs to early — infer from the description if possible, otherwise ask. They can span multiple namespaces if the feature crosses boundaries.

Once determined, also read `decisions/records/<namespace>/PRACTICES.md` if it exists for namespace-specific conventions.

### 3. Check for related existing decisions

Before proposing the breakdown, scan existing decision files for:
- Decisions that reference the same code areas
- Decisions with overlapping tags or topics
- Decisions that the new feature might supersede

Mention any related decisions to the developer so the breakdown accounts for them.

### 4. Break it down

Analyze the feature and propose a breakdown into discrete decisions. Each decision should be:
- **Independent enough** to stand on its own as a rationale record
- **Concrete enough** that it captures a specific choice, not just "build X"
- **Ordered** by dependency where relevant (which decisions depend on others)

Present the proposed breakdown:

> I'd suggest breaking this into the following decisions:
>
> 1. **Choose payment gateway adapter pattern** — How to abstract the gateway interface
> 2. **Define retry strategy for failed payments** — Backoff logic and max attempts
> 3. **Idempotency key format** — How to prevent duplicate charges
>
> Does this look right? Want to add, remove, or adjust any?

Iterate with the developer until the breakdown is agreed.

### 5. Choose a grouping tag

Propose a tag that groups these decisions:

> I'll tag all of these with `payment-gateway` so they're grouped together. Sound good?

The tag should be descriptive, kebab-case, and specific to this feature.

### 6. Create decision records

For each decision in the breakdown, run the same scripts used by `/dld-decide`:

First, get the next ID:
```bash
bash ../dld-common/scripts/next-id.sh
```

Then create the record, piping the body via `printf` with `\n` for newlines (do **not** use literal newlines in the body — use `\n` escape sequences):
```bash
printf "## Context\n\n...\n\n## Decision\n\n...\n\n## Rationale\n\n...\n\n## Consequences\n\n..." | bash ../dld-decide/scripts/create-decision.sh \
  --id "DL-NNN" \
  --title "Short descriptive title" \
  --namespace "billing" \
  --tags "payment-gateway" \
  --supersedes "DL-003" \
  --body-stdin
```

Repeat for each decision, incrementing the ID each time. Run `next-id.sh` before each creation to ensure correct sequencing.

If any decision supersedes an existing one, also update the old decision's status:
```bash
bash ../dld-common/scripts/update-status.sh DL-003 superseded
```

For each decision, compose a focused body. Keep it concise — the full feature context is captured across the group. Each individual decision should capture its own specific rationale.

### 7. Regenerate INDEX.md

After all decisions are created:
```bash
bash ../dld-common/scripts/regenerate-index.sh
```

### 8. Suggest next steps

> Created **N** decisions for feature `<tag>`:
>
> | ID | Title | Status |
> |----|-------|--------|
> | DL-010 | Choose payment gateway adapter pattern | proposed |
> | DL-011 | Define retry strategy for failed payments | proposed |
> | DL-012 | Idempotency key format | proposed |
>
> Next steps:
> - `/dld-implement` — implement all proposed decisions (or `/dld-implement DL-NNN` for a specific one)
> - `/dld-lookup tag:<tag>` — review all decisions in this group
