# DLD Kit — Decision-Linked Development

Stop AI agents from breaking code they don't understand.

> [!NOTE]
> Early development — APIs, file formats, and skill interfaces may change.

---

AI agents write code confidently. They just don't know *why* your code looks the way it does. That retry logic tuned for a specific API's rate limiting? That validation step catching a production-only edge case? Those decisions live in Jira tickets, Slack threads, and departed engineers' heads. DLD aims to fix this with an **append-only decision log** and `@decision(DL-XXX)` annotations that link code directly to the reasoning behind it. When an agent encounters an annotation, it reads the decision *before* modifying anything. DLDs primary focus is to connect context to code in a highly visible and directly accessible way, avoiding guesswork & git or JIRA archeology to retrieve core business context. Ensuring absolute, immediate, correctness of the produced software is however *not* within the core scope of DLD; for that you will need to combine it with sound general test & validation practices.

## Install

Requirements: Node.js 20+ and git. `gh` is optional; `/dld-reindex` uses it to check open PRs.

Each channel below installs the same skills. They differ in which agents they reach, how the always-on rule gets into the agent's context, and how you update.

| Channel | Agents | Installs into | Always-on rule | Update with |
|---|---|---|---|---|
| [`npx dld-kit init`](#npx-dld-kit-init) | Claude Code, Antigravity, Codex, Cursor, OpenCode, Pi | The project, committed | Written by `init` | `npx dld-kit@latest update` |
| [Claude Code plugin](#claude-code-plugin) | Claude Code | Your user profile | SessionStart hook | `claude plugin marketplace update dld-kit`, then `claude plugin update dld@dld-kit` |
| [Codex and Copilot CLI plugins](#codex-and-copilot-cli-plugins) | Codex, Copilot CLI | Your user profile | dld-init skill | Codex's plugin manager; `copilot plugin update` |
| [Pi package](#pi-package) | Pi | Your user profile, or the project with `-l` | dld-init skill | `pi update npm:dld-kit` |
| [`npx skills` / `gh skill`](#npx-skills-or-gh-skill) | Any agent those tools support | The project, or your user profile with `-g` | dld-init skill | `npx skills update` / `gh skill update` |
| [Manual copy](#manual-copy) | Any Agent Skills harness | Wherever you copy them | dld-init skill | Copy again |

### `npx dld-kit init`

Run in the root of a git repository:

```bash
npx dld-kit init
```

This writes:

- `dld.config.yaml`, `decisions/records/` and `decisions/INDEX.md`
- the `dld-*` skills for each selected agent: `.claude/skills/` for Claude Code, `.agents/skills/` for the others
- the always-on rule, once per agent: a block between `<!-- dld-kit:start -->` and `<!-- dld-kit:end -->` in `AGENTS.md` (or `CLAUDE.md`) for Codex, Cursor, OpenCode and Pi, `.agents/rules/dld-workflow.md` for Antigravity, and `.claude/rules/dld-workflow.md` for Claude Code unless Claude Code already reads the block (see [Agents](#agents)). When the block goes into `AGENTS.md` and the project has no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`, it writes `.claude/CLAUDE.md` instead, which imports `AGENTS.md` for Claude Code

`init` detects the agents from files in the project (`.claude/`, `.codex/`, `.cursor/`, `opencode.json`, `.pi/`, `AGENTS.md` and so on) and asks you to confirm the list. Options:

- `--agent claude,codex`: add agents to the detected ones
- `--namespaces billing,auth`: one decision directory per namespace (for monorepos)
- `--yes`: skip the question and use the detected agents plus `--agent`

Commit the files. Teammates then need nothing installed.

To upgrade, run `npx dld-kit@latest update`. It rewrites the `dld-*` skills and the rule for the agents already installed, and never touches decision records or `dld.config.yaml`. Add `--agent <name>` to install for another agent.

### Claude Code plugin

In Claude Code:

```
/plugin marketplace add jimutt/dld-kit
/plugin install dld@dld-kit
```

Then run `/dld-init` in each project. The plugin's SessionStart hook adds the always-on rule to each session in projects that have `dld.config.yaml` and do not already load the rule. `/dld-init` also installs `.claude/rules/dld-workflow.md`, so teammates without the plugin get the rule too.

Skills run as `/dld-plan`, or as `/dld:dld-plan` if another skill has the same name. Third-party marketplaces do not auto-update by default. To update:

```bash
claude plugin marketplace update dld-kit
claude plugin update dld@dld-kit
```

### Codex and Copilot CLI plugins

Both install the portable skills from the repository root, with no hook.

```bash
codex plugin marketplace add jimutt/dld-kit       # then install dld from /plugins in Codex
copilot plugin marketplace add jimutt/dld-kit
copilot plugin install dld@dld-kit
```

Then run the dld-init skill in each project for the config and the rule. For Copilot CLI it installs the rule as for Codex.

### Pi package

```bash
pi install npm:dld-kit        # for your user
pi install -l npm:dld-kit     # for this project (.pi/settings.json)
```

Run `/skill:dld-init` in each project for the config and the rule. Update with `pi update npm:dld-kit`.

### `npx skills` or `gh skill`

```bash
npx skills add jimutt/dld-kit
gh skill install jimutt/dld-kit --all
```

Install all the skills. If you pick some with `--skill`, include `dld-common`: it holds the `dld` CLI the other skills run. Then run the dld-init skill in each project for the config and the rule. Update with `npx skills update` or `gh skill update`.

`npx skills` puts the files in `.agents/skills/` and links them from `.claude/skills/` for Claude Code. `dld update` refuses to write through those links; keep updating with `npx skills update`.

### Manual copy

Copy the `dld-*` directories from [`skills/`](skills/) into your agent's skills directory, or from [`.claude/skills/`](.claude/skills/) into a project's `.claude/skills/` for Claude Code. Include `dld-common`. Then run the dld-init skill for the config and the rule.

### Combining channels

Channels can be combined. These combinations need care:

- **A user-level plugin or package, plus skills committed in the project for the same agent.** The agent sees each skill twice, possibly at different versions. In Claude Code, run the plugin's copy as `/dld:dld-plan`.
- **Skills for Claude Code and for an `.agents/skills/` agent in one project.** OpenCode and Cursor read both `.claude/skills/` and `.agents/skills/`. OpenCode 2.x loads the `.agents/skills/` copy; OpenCode 1.x and Cursor may load either. Both copies work.
- **`dld update` and `npx skills` on the same skills.** `dld update` refuses symlinked skills and warns when `skills-lock.json` lists `dld-*` skills. Update those skills with one tool.

### Agents

| Agent | Skills (`dld init`) | Always-on rule (`dld init`, `/dld-init`) | Run a skill |
|---|---|---|---|
| Claude Code | `.claude/skills/` | `.claude/rules/dld-workflow.md`, or the block in `AGENTS.md` when a CLAUDE file imports it (`@AGENTS.md`) | `/dld-plan` |
| Antigravity | `.agents/skills/` | `.agents/rules/dld-workflow.md` | Ask for the dld-plan skill |
| Codex | `.agents/skills/` | Block in `AGENTS.md` | Ask for the dld-plan skill |
| Cursor | `.agents/skills/` | Block in `AGENTS.md` | Ask for the dld-plan skill |
| OpenCode | `.agents/skills/` | Block in `AGENTS.md`, or `CLAUDE.md` if there is no `AGENTS.md` | Ask for the dld-plan skill |
| Pi | `.agents/skills/` | Block in `AGENTS.md`, or `CLAUDE.md` if there is no `AGENTS.md` | `/skill:dld-plan` |
| Copilot CLI | Plugin only | Block in `AGENTS.md` (installed as for Codex) | Ask for the dld-plan skill |

A new block goes into `AGENTS.md` if it exists, else into `CLAUDE.md` if that exists, else into a new `AGENTS.md`. Codex and Cursor read only `AGENTS.md`: when the block ends up in `CLAUDE.md`, `dld install-rule` warns and says how to move it.

Each agent gets the rule once. Claude Code reads `AGENTS.md` by itself only when the project has no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`, so adding one of those (even an uncommitted `CLAUDE.local.md`) would stop it. When the block is in `AGENTS.md` and none of those files exists, `init` writes `.claude/CLAUDE.md` with the line `@../AGENTS.md`. Claude Code then loads `AGENTS.md` through that import, once, whichever CLAUDE files are added later. If a `CLAUDE.md` of yours already imports `@AGENTS.md`, the block there is Claude Code's rule and no other file is written.

The examples below use Claude Code's `/dld-plan` form. In other agents, name the skill instead, e.g. "use the dld-plan skill to plan the retry feature".

## Get started

### New feature or change

Use `/dld-plan` to break it down into decisions, then implement:

```
/dld-init              # Bootstrap DLD in your repo (run once)
/dld-plan              # Break it down into decisions interactively
/dld-adjust DL-001     # Refine decisions if details change before implementing
/dld-implement DL-001  # Implement each decision (or batch related ones)
/dld-snapshot          # Generate overview docs from the decision log
```

For a small, isolated change (a bug fix, a single design choice), `/dld-decide` records one decision directly without the planning step.

### Existing codebase

Use `/dld-retrofit` to generate decisions from code that already exists:

```
/dld-init              # Bootstrap DLD in your repo (run once)
/dld-retrofit          # Analyze code, generate decisions and annotations
/dld-snapshot          # Generate overview docs from the decision log
```

This works as a standalone "document this codebase" action. You get structured decision records, code annotations, and a generated system overview. From there you can adopt the full workflow, or just re-run `/dld-audit-auto` and `/dld-snapshot` on a schedule to keep documentation in sync.

### Working in a team

When multiple developers draft decisions in parallel, two of them can end up picking the same `DL-NNN` ID. Once one of those PRs lands on the base branch, the other can't rebase cleanly — the colliding decision file path appears in both histories.

```
/dld-reindex           # Renames the local draft(s) to the next free ID,
                       # rewrites @decision annotations and cross-references,
                       # squashes the branch into a single rebase-clean commit
```

Run this before rebasing onto an updated base. The skill resolves the ID against the base branch and, when `gh` is installed and authenticated, also against open PRs so the new IDs don't collide with someone else's in-flight work.

## How it works

DLD is implemented as a set of AI agent skills following the [Agent Skills](https://agentskills.io) open standard.

### The decision record

Each decision is a markdown file with YAML frontmatter:

```markdown
---
id: DL-008
title: "Use exponential backoff for payment gateway retries"
timestamp: 2026-02-15T09:20:00Z
status: accepted
supersedes: [DL-002]
amends: []
tags: [payments, resilience]
references:
  - path: src/payments/gateway.ts
    symbol: retryWithBackoff
---

## Context
The payment gateway occasionally returns 503s under load. Our initial
fixed-interval retry (DL-002) caused retry storms that made things worse.

## Decision
Use exponential backoff with jitter, capped at 30 seconds, max 5 attempts.

## Rationale
Exponential backoff prevents retry storms. Jitter avoids thundering herd
when multiple requests fail simultaneously...

## Consequences
Failed payments take longer to resolve (up to ~60s worst case)...
```

### The code annotation

```typescript
// @decision(DL-008)
function retryWithBackoff(fn: () => Promise<Response>): Promise<Response> {
  // ...
}
```

When an AI agent encounters this annotation, it reads the decision before modifying the code. If the planned change conflicts with the decision, it tells you and suggests recording a new decision.

## How DLD compares to spec-driven development

There are great spec-driven tools out there ([Spec Kit](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/), [OpenSpec](https://openspec.dev/), [Kiro](https://kiro.dev/)) and they work well for many teams, especially for structured greenfield development. If they fit your workflow, use them.

DLD is a different approach for teams that find spec documents hard to maintain over time, or that want decision context embedded closer to the code. It borrows from **event sourcing**:

- **Decisions are append-only events** — once accepted, a decision's content is immutable. Metadata (`status`, `references`) can be updated mechanically (e.g., after refactors), but the reasoning is never rewritten. Decisions can be superseded but never edited or deleted. This creates a complete timeline of how the system evolved.
- **The spec is a derived projection** — generated from the decision log, never manually maintained. Like a read model built from an event stream.
- **Tight code coupling** — `@decision` annotations in code act as mechanical triggers for AI agents. The decision context lives *where the code is* rather than in a separate document.

DLD is designed for long-lived codebases where decisions accumulate, original authors move on, and AI agents need to safely modify code they didn't write. If that sounds like your situation, give it a try.

## Skills

The table uses Claude Code's slash form; in Pi use `/skill:<name>`, and in other agents ask for the skill by name.

| Skill | Purpose |
|-------|---------|
| `/dld-init` | Bootstrap DLD in a repository (run once) |
| `/dld-decide` | Record a single decision interactively |
| `/dld-plan` | Break down a feature into multiple grouped decisions |
| `/dld-implement` | Implement proposed decisions — writes code, adds annotations, updates status |
| `/dld-adjust` | Adjust or update existing decisions — handles permission gating and correct intent interpretation |
| `/dld-lookup` | Query decisions by ID, tag, code path, or keyword |
| `/dld-status` | Overview of the decision log — counts, recent decisions, run tracking |
| `/dld-audit` | Scan for drift between decisions and code |
| `/dld-audit-auto` | Autonomous audit — detects drift, fixes issues, opens a PR (for scheduled/CI use) |
| `/dld-snapshot` | Generate SNAPSHOT.md (detailed reference) and OVERVIEW.md (narrative synthesis with diagrams) |
| `/dld-retrofit` | Bootstrap decisions from an existing codebase (broad or detailed mode) |
| `/dld-reindex` | Resolve decision ID collisions with the base branch (and open PRs) before rebasing — renames colliding local drafts, rewrites annotations and cross-references, squashes branch commits into a rebase-clean reindex commit |

### Active workflow

The core DLD loop: record decisions via `/dld-decide` or `/dld-plan`, implement them with `/dld-implement`, and the framework maintains tight coupling between the decision log and code through `@decision` annotations. `/dld-audit` periodically checks for drift, and `/dld-snapshot` regenerates the derived specification.

<img width="3180" height="2100" alt="DLD high-level workflow overview showing the decision log, code annotations, generated specification, and drift detection" src="https://github.com/user-attachments/assets/fc8b7804-10ce-439b-ba0c-1f431a26a46e" />

### Passive mode

For teams that want living documentation without changing how they work. Run `/dld-init` and `/dld-retrofit` once to bootstrap, then schedule `/dld-audit-auto` and `/dld-snapshot` to run automatically (e.g. nightly via CI). The audit detects unreferenced code changes, infers new decisions, and back-annotates the code — all without developers invoking any DLD commands during their normal workflow.

<img width="2880" height="2760" alt="DLD passive mode showing scheduled automation that keeps decisions and docs in sync without workflow changes" src="https://github.com/user-attachments/assets/36bba4e1-e8eb-4390-a484-f18f54638fa1" />

> [!NOTE]
> DLD doesn't include a scheduler. How you trigger the automated runs is up to you — [Claude Code's built-in cron support](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#2171), a CI pipeline step, or any other external scheduler all work.

## Project structure

### Flat mode (default)

```
dld.config.yaml
decisions/
  INDEX.md          # Auto-generated decision index
  SNAPSHOT.md       # Detailed per-decision reference
  OVERVIEW.md       # Narrative synthesis with Mermaid diagrams
  PRACTICES.md      # Development practices manifest (optional)
  .dld-state.yaml   # Last audit and snapshot runs
  records/
    DL-001.md
    DL-002.md
```

### Namespaced mode (monorepos)

```
dld.config.yaml
decisions/
  INDEX.md
  SNAPSHOT.md
  OVERVIEW.md
  PRACTICES.md
  records/
    billing/
      DL-001.md
      DL-004.md
      PRACTICES.md  # Namespace-specific practices (optional)
    auth/
      DL-002.md
      DL-005.md
```

IDs are globally sequential across namespaces, so `@decision(DL-012)` is unambiguous regardless of which namespace it belongs to.

## Status lifecycle

```
proposed --> accepted --> deprecated
                     --> superseded (by a newer decision)
```

- **proposed** — recorded but not yet implemented (mutable — can be refined during implementation)
- **accepted** — implemented, code references this decision via annotations (content immutable, metadata like `status` and `references` can be updated)
- **deprecated** — no longer relevant, no replacement
- **superseded** — replaced by a newer decision

## Concepts

### Practices manifest

An optional `decisions/PRACTICES.md` captures project development conventions (testing approach, code style, architecture patterns). The AI agent reads this when making and implementing decisions — it's most useful during `/dld-implement` where it directly influences how code is written.

### Spec as projection

The snapshot and overview documents are **generated, not maintained**. Like event sourcing read models, they're derived from the decision log and can be regenerated at any time. You maintain individual decisions; the framework derives the consolidated view.

### Drift detection

`/dld-audit` detects when code and decisions have drifted apart — orphaned annotations, stale references, modified annotated files that may need decision updates.

## Advanced configuration

### Custom snapshot artifacts

By default, `/dld-snapshot` generates `SNAPSHOT.md` and `OVERVIEW.md`. You can define additional documentation artifacts in `dld.config.yaml` — each one synthesized from the decision log using a prompt you provide:

```yaml
snapshot_artifacts:
  - title: ONBOARDING.md
    prompt: >
      Generate a developer onboarding guide that explains the system
      from scratch, assuming no prior context. Focus on what a new
      contributor needs to know to start working.
  - title: API-CONTRACTS.md
    prompt: >
      Summarize all API-related decisions into a single API contract
      reference. Include endpoints, payload shapes, and auth requirements.
```

Custom artifacts are written to `decisions/` alongside the built-in files and regenerated every time `/dld-snapshot` runs. The `title` serves as both the filename and the document heading. See [project configuration](docs/framework/project-configuration.md#snapshot-artifacts) for details.

### Implementation review

`/dld-implement` includes a built-in review step that launches a subagent to check all code changes before finalizing. The reviewer scans for correctness, security issues, type safety problems, and consistency with existing patterns — then reports findings grouped by severity (critical, moderate, minor).

This is enabled by default. To disable it, set `implement_review` to `false` in `dld.config.yaml`:

```yaml
implement_review: false
```

The review subagent operates with limited context and may flag false positives. The implementing agent uses its own judgment and asks for user input when uncertain about a finding.

## CLI

The `dld` command comes with the npm package (`npx dld-kit <command>`, or `npm install --global dld-kit`). The skills carry their own copy in `dld-common/scripts/dld.mjs`, so they never need a global install.

| Command | What it does |
|---|---|
| `dld init` | Creates `dld.config.yaml`, `decisions/` and `INDEX.md`, then installs the skills and the rule (see [above](#npx-dld-kit-init)) |
| `dld update` | Rewrites the installed skills and rule with this version; `--agent` adds agents |
| `dld install-rule --agent <names>` | Installs or refreshes only the always-on rule |
| `dld session-context --agent <name>` | Prints the rule for a session hook, unless the agent loads it already (used by the Claude Code plugin) |
| `dld --help` | Lists the setup commands above, then the commands the skills run |

`init` and `update` refuse to overwrite files from a newer dld-kit unless given `--force`.

Semantic versioning covers the four commands above, their flags, exit codes and documented output, and `--help` and `--version`. The other commands (`next-id`, `create-decision`, `regenerate-index` and so on) are internal: the skills run them from their own bundled copy of the CLI, and their names, arguments and output can change in a minor release. Don't script against them.

## Development

```bash
bun install                               # dev dependencies (Bun is a dev tool; the CLI runs on Node 20+)
npm run lint && npm run typecheck && npm test
```

Skills and plugin manifests are generated: edit `templates/`, then run `npm run generate` to rebuild `skills/`, `.claude/skills/`, `claude-plugin/` and the manifests. See `CLAUDE.md` for the full set of commands, `docs/releasing.md` for releases, and `docs/plan/v1.md` for the 1.0 plan.

## Further reading

- [Concept paper](docs/concept/dld-concept.md) — full rationale and design philosophy
- [TL;DR](docs/concept/dld-tldr.md) — one-page summary
- [FAQ](docs/concept/dld-faq.md) — anticipated questions
- [Decision record format](docs/framework/decision-record-format.md) — schema and field reference
- [Project configuration](docs/framework/project-configuration.md) — config file and directory layout
- [Skill design plan](docs/plan/skill-design.md) — detailed skill specifications

## Acknowledgements

DLD builds on ideas from several projects and people:

- **[Architecture Decision Records (ADRs)](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions)** — Michael Nygard's foundational concept (2011) of recording architectural decisions as structured documents. DLD extends ADRs to cover all decision types and adds code-level coupling.
- **[Embedded ADRs (e-adr)](https://github.com/adr/e-adr)** — Pioneered `@ADR` annotations in Java code, linking decisions to classes and methods. DLD generalizes this to be language-agnostic and AI-agent-aware.
- **[Vibe ADR](https://medium.com/devops-ai/vibe-adr-building-with-intention-in-the-age-of-ai-d01e93f36696)** — Owen Zanzal's concept of decision records as "living nodes of intent" for both humans and AI.
- **[OpenSpec](https://openspec.dev/)** — A change-based specification framework with a delta model and archive workflow. Its brownfield-first philosophy and incremental approach validated key assumptions behind DLD.
- **[Spec Kit](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)** — GitHub's spec-driven development toolkit. DLD shares the goal of giving AI agents better context but inverts the relationship — the spec is derived from decisions rather than being the primary artifact.
- **[IIC Kit (Intent Integrity Kit)](https://github.com/docsforadobe/intent-integrity-for-claude-code)** — A constitution-driven framework for Claude Code that influenced DLD's skill organization and practices manifest approach.
- **[Kiro](https://kiro.dev/)** — AWS's spec-driven development IDE, part of the broader SDD movement that motivated DLD's alternative approach.
- **Event Sourcing / CQRS** — The architectural pattern behind DLD's core model: decisions as an append-only event stream, specs as derived projections.
- **[ADR community resources](https://adr.github.io)** — The comprehensive collection of ADR tools, templates, and guidance that provided a foundation for DLD's record format.

See the [concept paper](docs/concept/dld-concept.md) for a detailed discussion of how DLD relates to these approaches.

## Roadmap

DLD is under active development. Feature requests and ideas are welcome — [open an issue](https://github.com/jimutt/dld-kit/issues).

## Manual rule setup

The always-on rule tells the agent to read a decision before changing code annotated with it. `/dld-init` installs it with `dld install-rule --agent <harness>`, which picks the file the harness loads: `.claude/rules/dld-workflow.md` for Claude Code (unless it reads the block in `AGENTS.md`, directly or through a `.claude/CLAUDE.md` import), `.agents/rules/dld-workflow.md` for Antigravity, or a marked block in `AGENTS.md` (or `CLAUDE.md`) for Codex, Cursor, OpenCode and Pi.

To add it by hand instead, copy [`templates/rules/dld-workflow.md`](templates/rules/dld-workflow.md) into one of those files.

## License

[MIT](LICENSE)
