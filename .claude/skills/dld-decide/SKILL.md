---
name: dld-decide
description: Record a single development decision as a markdown file with YAML frontmatter. Collects context, rationale, and code references interactively.
user_invocable: true
---

# /dld-decide — Record a Decision

You are helping the developer record a development decision. This should be a focused, low-ceremony conversation — not an interrogation.

## Interaction style

Use the `AskUserQuestion` tool for all questions and prompts. This provides a structured input experience for the user rather than waiting for freeform replies.

## Script Paths

Shared scripts:
```
.claude/skills/dld-common/scripts/next-id.sh
.claude/skills/dld-common/scripts/regenerate-index.sh
.claude/skills/dld-common/scripts/update-status.sh
```

Skill-specific scripts:
```
.claude/skills/dld-decide/scripts/create-decision.sh
```

## Prerequisites

Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.

## Read project context

1. Read `dld.config.yaml` to understand the project structure (flat vs namespaced, decisions directory, namespaces list)
2. Read `decisions/PRACTICES.md` if it exists — be aware of project conventions when helping structure the decision
3. For namespaced projects, also read `decisions/records/<namespace>/PRACTICES.md` if it exists for the relevant namespace

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
- Decisions that this one might supersede or amend

If you find related decisions, mention them and ask whether this decision **supersedes** (fully replaces) or **amends** (partially modifies) any of them. A superseded decision gets marked as `superseded` and is no longer active. An amended decision stays `accepted` — the amendment changes part of its scope while the rest remains in effect.

### 4. Determine namespace (namespaced projects only)

If the project is namespaced, determine which namespace this decision belongs to. Infer from the code references if possible, otherwise ask.

### 5. Assign ID

Run the next-id script:
```bash
bash .claude/skills/dld-common/scripts/next-id.sh
```

This outputs the next available ID (e.g., `DL-004`).

### 6. Create the decision record

Compose the markdown body with the relevant sections (Context, Decision, Rationale, Consequences). Omit sections that aren't relevant, but always include Context and Decision.

Then run the create-decision script, piping the body via `printf` with `\n` for newlines (do **not** use literal newlines in the body argument — use `\n` escape sequences so the entire command stays on one logical line):
```bash
printf "## Context\n\nWhat prompted this decision.\n\n## Decision\n\nWhat was decided.\n\n## Rationale\n\nWhy this choice.\n\n## Consequences\n\nWhat becomes easier or harder." | bash .claude/skills/dld-decide/scripts/create-decision.sh \
  --id "DL-NNN" \
  --title "Short descriptive title" \
  --namespace "billing" \
  --tags "tag1, tag2" \
  --supersedes "DL-003, DL-007" \
  --amends "DL-005" \
  --body-stdin
```

Flags `--namespace`, `--tags`, `--supersedes`, `--amends` are optional. The script creates the file with YAML frontmatter and the body content, and outputs the file path.

> **Note:** If the body contains literal `%` characters, escape them as `%%` (printf format string requirement).

If this decision supersedes others, also update their status:
```bash
bash .claude/skills/dld-common/scripts/update-status.sh DL-003 superseded
```

**Do not** update the status of amended decisions — they stay `accepted`.

### 7. Regenerate INDEX.md

```bash
bash .claude/skills/dld-common/scripts/regenerate-index.sh
```

### 8. Suggest next steps

> Decision **DL-NNN** recorded as `proposed`.
>
> Next steps:
> - `/dld-implement DL-NNN` — implement this decision
> - `/dld-decide` — record another decision
