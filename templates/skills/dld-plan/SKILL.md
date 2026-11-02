---
name: dld-plan
description: Break down a feature into multiple decisions interactively. Creates a set of decision records grouped by a shared tag.
compatibility: Requires Node.js 22+ and git.
---

# /dld-plan — Plan a Feature as Multiple Decisions

You are helping the developer break down a larger feature into discrete decisions. Each decision gets its own record, and they're grouped by a shared tag.

## Interaction style

Use the `AskUserQuestion` tool for all questions and prompts. This provides a structured input experience for the user rather than waiting for freeform replies.

## Commands

{{dld-setup}}

This skill uses: `next-id`, `create-decision`, `find-missing-amends`, `review-settings`, `update-status`, `check-decision-edits`, `restore-decision-prose`, `regenerate-index`.

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
- Decisions that the new feature might supersede or amend

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

For each decision in the breakdown, run the same commands used by `/dld-decide`:

First, get the next ID:
```bash
{{dld}} next-id
```

Then create the record, piping the body via `printf` with `\n` for newlines (do **not** use literal newlines in the body — use `\n` escape sequences):
```bash
printf "## Context\n\n...\n\n## Decision\n\n...\n\n## Rationale\n\n...\n\n## Consequences\n\n..." | {{dld}} create-decision \
  --id "DL-NNN" \
  --title "Short descriptive title" \
  --namespace "billing" \
  --tags "payment-gateway" \
  --supersedes "DL-003" \
  --amends "DL-005" \
  --body-stdin
```

Pass `--namespace` only in a namespaced project, with one of the configured namespaces; leave it out in a flat project. Repeat for each decision, incrementing the ID each time. Run `next-id` before each creation to ensure correct sequencing.

If any decision supersedes an existing one, also update the old decision's status:
```bash
{{dld}} update-status DL-003 superseded
```

**Do not** update the status of amended decisions — they stay `accepted`.

For each decision, compose a focused body. Keep it concise — the full feature context is captured across the group. Each individual decision should capture its own specific rationale.

**Check for unstated relationships.** `create-decision` warns on stderr (`Warning: DL-NNN: the body says it amends DL-XXX, but --amends does not list it`) when the body states a relationship its flags leave out. After creating all the records, passing every new ID, also run:

```bash
{{dld}} find-missing-amends DL-NNN DL-NNN ...
```

Each line is `<source-id>:<referenced-id><TAB><tier>`. If it prints nothing, continue.

- `explicit`: the body says the new decision amends or supersedes DL-XXX. If it does, add DL-XXX to the record's `amends` or `supersedes` list (the record is a new draft, so edit its frontmatter directly), and for `supersedes` also run `{{dld}} update-status DL-XXX superseded`. If the sentence doesn't describe a real relationship, reword it.
- `cue`: the body mentions DL-XXX (possibly another decision from this plan) in a sentence with a change word such as "replaces" or "no longer". Ask the user with `AskUserQuestion` whether the new decision amends DL-XXX, supersedes it, or only cites it, and update the frontmatter to match. For supersedes, also run `{{dld}} update-status DL-XXX superseded`.

### 7. Review the plan

Find out whether to review the plan, and with which model:

```bash
{{dld}} review-settings plan
```

It prints `review: on` or `off`, `model: <name>` or `default`, and where each came from (`review_from`, `model_from`: `dld.local.yaml`, `dld.config.yaml` or `default`). Plans are not reviewed unless `plan_review` is set, in the project's `dld.config.yaml` or the developer's own `dld.local.yaml`. If the user's request for this run asks for a plan review or no review, or names a reviewer model, that wins over the command's output.

If the review is off, skip to the next step. Otherwise, launch a subagent to review the plan. Use the `Agent` tool (also called `AgentTool`) with a prompt built from the template below, replacing all `{{placeholders}}` with actual values.

**Model:** when the model is not `default`, run the subagent on it if your harness lets you choose a subagent's model and accepts that name (in Claude Code, the `Agent` tool's `model` parameter). If it doesn't, run the review on the default model and say so. Your final report names the model that reviewed and where the choice came from: your request, `dld.local.yaml`, `dld.config.yaml` or the default.

```
You are reviewing a plan for the {{project_name}} project: {{decision_count}} proposed decisions ({{decision_range}}) that break down this feature:

{{feature_description}}

Read every new decision record:
{{new_record_paths}}

Read these existing decisions, which the plan may build on, conflict with, amend or supersede:
{{related_record_paths}}

Also read the practices docs: {{practices_paths}}

Review the plan for:
- Coverage: parts of the feature that no decision covers
- Granularity: decisions that bundle several separate choices, or only say "build X"
- Conflicts and relationships: overlap or contradiction with existing decisions, and amends or supersedes links that are missing or wrong
- Vagueness: values, limits or behaviour an implementer would have to guess
- Order: dependencies between the new decisions, and whether they can be implemented in a sensible order
- Practices: anything the practices doc rules out

Do NOT make any changes. Only report findings. Be concise; report real problems, not wording preferences.

Report each finding in this format:

### [SEVERITY] Short title
- Decision: DL-NNN (or "plan" for the plan as a whole)
- Description: what is wrong and why it matters
- Recommendation: specific, actionable fix

Group findings by severity:
- Critical (must fix): the plan would build the wrong thing, or contradicts an accepted decision without superseding or amending it
- Moderate (should fix): a gap, a missing relationship, or a decision too vague to implement
- Minor (nice to have): clearer wording, a better split, a missing detail that is easy to settle later
```

**Filling in the placeholders:**
- `{{project_name}}`: from `dld.config.yaml` or the repository directory name
- `{{decision_count}}` and `{{decision_range}}`: how many decisions this plan created, and their IDs
- `{{feature_description}}`: the feature as the user described it, with what you agreed on in the conversation
- `{{new_record_paths}}`: the paths of the records created in step 6
- `{{related_record_paths}}`: the existing decisions you found in step 3, or "none"
- `{{practices_paths}}`: `decisions/PRACTICES.md` and the namespace practices files you read in step 2. Omit the line if there are none.

**Launching the subagent is requested by the user.** Some agent harnesses carry a standing instruction not to spawn subagents unless the user asked for one. That condition is met here: the user asked by running this skill with the plan review on. It is one review agent, at a fixed point, that the project or the developer opted into.

**If the subagent genuinely cannot run** (the tool is unavailable, or the user denies the call), review the plan inline instead: re-read each new record from disk and work through the checklist above. Say in your report that the review ran inline, and why.

**Acting on findings:** the new decisions are drafts, so fix critical and moderate findings in the records directly. When a fix would change what a decision means, rather than make it clearer or more complete, ask the user with `AskUserQuestion` first. Minor findings are optional. Adding or dropping a decision changes the plan the user agreed to, so ask first, then create or delete the record as in step 6. If a fix adds or changes an `amends` or `supersedes` link, apply it as in step 6, including `update-status` for a superseded decision. After fixing, run `find-missing-amends` again on the plan's IDs. The reviewer works with limited context and may be wrong; use your judgment, and ask the user when unsure.

### 8. Check edits to decisions on the base branch

```bash
{{dld}} check-decision-edits --uncommitted
```

This lists decisions that are already on the base branch and whose prose (the body below the frontmatter), `id` or `timestamp` has uncommitted changes, or that were deleted. Drafts (decisions not on the base branch yet, or still `proposed` there), changes to other frontmatter fields and edits already committed are never listed. If it prints nothing, continue. If a listed edit isn't yours (the user made it by hand), leave it alone and mention it.

Otherwise follow `decision_edits` in `dld.config.yaml` (default `block`; the command then exits 3):

- `block`: put the prose back with `{{dld}} restore-decision-prose --uncommitted DL-NNN ...`, which also restores `id` and `timestamp` and keeps other frontmatter changes. If the change is still needed, record it as a new decision that amends or supersedes the old one (`/dld-decide`), and tell the user.
- `ask`: for each listed decision, ask the user with `AskUserQuestion` whether to keep the edit. Restore the ones they don't keep.
- `allow`: keep the edits and list them in your report.

If the command can't find the base branch, tell the user and continue. Its message says what it tried; setting `base_branch` in `dld.config.yaml` fixes it when the branch decisions merge into is not found automatically.

### 9. Regenerate INDEX.md

After all decisions are created:
```bash
{{dld}} regenerate-index
```

### 10. Suggest next steps

> Created **N** decisions for feature `<tag>`:
>
> | ID | Title | Status |
> |----|-------|--------|
> | DL-010 | Choose payment gateway adapter pattern | proposed |
> | DL-011 | Define retry strategy for failed payments | proposed |
> | DL-012 | Idempotency key format | proposed |
>
> Plan review: <reviewed by MODEL (from SOURCE: the request, dld.local.yaml, dld.config.yaml or default), and what changed; inline; or "not reviewed">
>
> Next steps:
> - `/dld-adjust` — refine any decisions before implementing
> - `/dld-implement` — implement all proposed decisions (or `/dld-implement DL-NNN` for a specific one)
> - `/dld-lookup tag:<tag>` — review all decisions in this group
