# Workflows

The examples below use Claude Code's `/dld-plan` form. In other agents, name the skill instead, e.g. "use the dld-plan skill to plan the retry feature".

## New feature or change

Use `/dld-plan` to break it down into decisions, then implement:

```
/dld-init              # Bootstrap DLD in your repo (run once)
/dld-plan              # Break it down into decisions interactively
/dld-adjust DL-001     # Refine decisions if details change before implementing
/dld-implement DL-001  # Implement each decision (or batch related ones)
/dld-snapshot          # Generate overview docs from the decision log
```

For a small, isolated change (a bug fix, a single design choice), `/dld-decide` records one decision directly without the planning step.

## Existing codebase

Use `/dld-retrofit` to generate decisions from code that already exists:

```
/dld-init              # Bootstrap DLD in your repo (run once)
/dld-retrofit          # Analyze code, generate decisions and annotations
/dld-snapshot          # Generate overview docs from the decision log
```

This works as a standalone "document this codebase" action. You get structured decision records, code annotations, and a generated system overview. From there you can adopt the full workflow, or just re-run `/dld-audit-auto` and `/dld-snapshot` on a schedule to keep documentation in sync.

## Working in a team

When multiple developers draft decisions in parallel, two of them can end up picking the same `DL-NNN` ID. Once one of those PRs lands on the base branch, the other can't rebase cleanly — the colliding decision file path appears in both histories.

```
/dld-reindex           # Renames the local draft(s) to the next free ID,
                       # rewrites @decision annotations and cross-references,
                       # squashes the branch into a single rebase-clean commit
```

Run this before rebasing onto an updated base. The skill resolves the ID against the base branch and, when `gh` is installed and authenticated, also against open PRs so the new IDs don't collide with someone else's in-flight work.

## Active workflow

The core DLD loop: record decisions via `/dld-decide` or `/dld-plan`, implement them with `/dld-implement`, and the framework maintains tight coupling between the decision log and code through `@decision` annotations. `/dld-audit` periodically checks for drift, and `/dld-snapshot` regenerates the derived specification.

<img width="3180" height="2100" alt="DLD high-level workflow overview showing the decision log, code annotations, generated specification, and drift detection" src="https://github.com/user-attachments/assets/fc8b7804-10ce-439b-ba0c-1f431a26a46e" />

## Passive mode

For teams that want living documentation without changing how they work. Run `/dld-init` and `/dld-retrofit` once to bootstrap, then schedule `/dld-audit-auto` and `/dld-snapshot` to run automatically (e.g. nightly via CI). The audit detects unreferenced code changes, infers new decisions, and back-annotates the code — all without developers invoking any DLD commands during their normal workflow.

<img width="2880" height="2760" alt="DLD passive mode showing scheduled automation that keeps decisions and docs in sync without workflow changes" src="https://github.com/user-attachments/assets/36bba4e1-e8eb-4390-a484-f18f54638fa1" />

> [!NOTE]
> DLD doesn't include a scheduler. How you trigger the automated runs is up to you — [Claude Code's built-in cron support](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#2171), a CI pipeline step, or any other external scheduler all work.
