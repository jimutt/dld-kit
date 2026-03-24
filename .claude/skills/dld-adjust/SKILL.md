---
name: dld-adjust
description: Adjust or update existing decision records. Handles permission gating for accepted decisions and correctly interprets adjustment requests.
user_invocable: true
---

# /dld-adjust — Adjust a Decision

You are helping the developer adjust one or more existing decision records. Your job is to apply their requested changes accurately and minimally.

## Interaction style

Use the `AskUserQuestion` tool for all questions and prompts. This provides a structured input experience for the user.

## Script Paths

Shared scripts:
```
.claude/skills/dld-common/scripts/update-status.sh
.claude/skills/dld-common/scripts/regenerate-index.sh
```

## Prerequisites

Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.

## Read project context

This skill is typically invoked mid-session after `/dld-plan`, `/dld-decide`, or during `/dld-implement`, so the project context and decision content are likely already in your conversation context. Only read these if you don't already have the information:

1. `dld.config.yaml` — project structure (flat vs namespaced, decisions directory)
2. The target decision file(s) — decision records (`DL-*.md`) live in the `records/` subdirectory under the decisions directory

## Step 1: Identify the decision(s)

The user may specify decision IDs explicitly (e.g., `/dld-adjust DL-005`), but often they won't — this skill is typically used right after `/dld-plan`, `/dld-decide`, or during `/dld-implement`, so the decisions are already part of the current conversation context.

- **Explicit IDs provided** — use those directly.
- **No IDs provided** — infer which decision(s) the user is referring to from the conversation context. If decisions were recently created or discussed in this session, assume those are the target. If it's still ambiguous, ask using `AskUserQuestion`.

Find and read each decision file. If a decision ID is not found, report the error and continue with any remaining valid IDs.

## Step 2: Determine if confirmation is needed

For each decision, check whether editing requires user confirmation:

### Proposed decisions (`status: proposed`)

Edit freely. No confirmation needed — proposed decisions are mutable by convention.

### Accepted decisions (`status: accepted`)

Check if the decision file has been committed and pushed to the remote:

```bash
# Get the last commit hash for the decision file
LAST_COMMIT=$(git log --format=%H -1 -- <path-to-decision-file>)

# Check if that commit exists on any remote branch
git branch -r --contains "$LAST_COMMIT" 2>/dev/null
```

- **Not yet pushed** (commit not on any remote branch, file is uncommitted, or file is untracked) — edit freely. It is still local work-in-progress.
- **Pushed to remote** — this decision has been published. Use `AskUserQuestion` to present options:
  1. **Edit anyway** — modify the accepted decision directly (breaks immutability convention)
  2. **Supersede instead** — record a new decision via `/dld-decide` that supersedes this one
  3. **Cancel** — do nothing

If the user chooses to supersede, direct them to `/dld-decide` and stop. If they cancel, stop. Only proceed with editing if they explicitly choose to edit anyway.

### Deprecated or superseded decisions

These are historical records. Ask for confirmation before editing — modifying historical decisions is unusual.

## Step 3: Collect the adjustment request

If the user provided the adjustment alongside the skill invocation (e.g., `/dld-adjust DL-005 remove the mention of Java records`), use that directly.

Otherwise, ask what changes they want to make.

Read the current decision content so you understand the full context of what you are working with.

## Step 4: Apply the changes

### CRITICAL — How to interpret adjustment requests

AI agents consistently misinterpret adjustment requests. Follow these rules exactly:

**"Remove X" means DELETE the content about X.**
Do NOT replace it with "We decided not to use X" or "We chose against X" or any other negative phrasing. Simply remove the sentences, bullet points, or paragraphs that mention X. The goal is a clean decision record that reads as if X was never discussed.

**"Change X to Y" means REPLACE the content.**
Find where X is described and replace it with Y. Do not add explanatory text about the change.

**"Add X" means INSERT new content.**
Add the new content in the appropriate section. Do not add meta-commentary about it being an addition.

**General principle:** The decision record should always read as a clean, coherent document. Never add editorial notes like "Updated on...", "Previously we...", "This was changed from...", or "We decided against...". The record captures the current state of the decision, not a changelog of edits.

**Examples of WRONG vs RIGHT:**

User says: *"Remove the mention of Java records from DL-005"*

- WRONG: Replacing "We will use Java records for DTOs" with "We decided not to use Java records for DTOs"
- RIGHT: Deleting the sentence "We will use Java records for DTOs" entirely (and any related sentences about Java records)

User says: *"Change the retry count from 3 to 5"*

- WRONG: Adding "Originally 3 retries, changed to 5 retries because..."
- RIGHT: Replacing "3 retries" with "5 retries" wherever it appears in the decision

User says: *"Remove the part about caching"*

- WRONG: "We considered caching but decided it is not relevant to this decision"
- RIGHT: Delete all sentences and paragraphs about caching. Adjust surrounding text so the document flows naturally.

### Applying edits

1. Read the full decision file
2. Apply the requested changes to the markdown body (and frontmatter fields like title or tags if affected)
3. Write the updated file
4. Show the user a brief summary of what changed

If multiple decisions are being adjusted, process them one at a time.

## Step 5: Regenerate INDEX.md

If any decision titles or metadata changed:

```bash
bash .claude/skills/dld-common/scripts/regenerate-index.sh
```

## Step 6: Suggest next steps

> Adjusted **DL-NNN**: [brief description of what changed]
>
> Next steps:
> - `/dld-lookup DL-NNN` — review the updated decision
> - `/dld-implement DL-NNN` — implement if the decision is proposed
> - `/dld-snapshot` — regenerate overview docs to reflect the update
