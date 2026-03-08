# DLD Kit — Decision-Linked Development

> **Early development — not production ready.** This toolkit is under active development and has not been tested extensively in real projects. APIs, file formats, and skill interfaces may change. Use at your own risk, and expect rough edges.

---

DLD is a framework for preserving decision context in AI-assisted software development. It places an **append-only decision log** at the center of the development workflow, with tight coupling between decisions and code via `@decision(DL-XXX)` annotations.

When an AI coding agent encounters an annotation, it looks up the referenced decision *before* modifying the code — turning institutional knowledge from something that lives in people's heads into a mechanical trigger the agent can't miss.

## Why

AI agents are good at writing code. They're bad at knowing *why* your code looks the way it does. That retry logic with the unusual backoff curve? It's tuned for a specific third-party API's rate limiting behavior. That seemingly redundant validation step? It catches a data inconsistency that only surfaces in production with legacy imports.

These decisions are scattered across Jira tickets, Slack threads, and departed engineers' heads. An AI agent *can* search these sources (well, maybe not the departed engineer's head), but without an explicit link from the code to the relevant context, it has to guess what to look for — and it usually doesn't know to look at all. DLD fixes this by recording decisions as structured artifacts linked directly to the code they affect.

### How it differs from Spec-Driven Development

Most SDD approaches in practice revolve around specification documents that tend to become maintenance burdens as systems evolve. DLD takes a different angle, borrowing from **event sourcing**:

- **Decisions are append-only events** — once accepted, decisions are immutable. They can be superseded but never edited or deleted. (Proposed decisions can still be refined during implementation.)
- **The spec is a derived projection** — generated from the decision log, never manually maintained. Like a read model built from an event stream.
- **Tight code coupling** — `@decision` annotations in code act as mechanical triggers for AI agents, not just documentation.

## How it works

DLD is implemented as a set of AI agent skills following the [Agent Skills](https://agentskills.io) open standard. All interaction happens through skill invocations.

### Installation

#### Via Tessl

DLD is packaged as a [Tessl](https://tessl.io) tile, which works across multiple AI agents (Claude Code, Cursor, Copilot, etc.):

```bash
# Clone and install locally
git clone https://github.com/jimutt/dld-kit.git
tessl install file:./dld-kit
```

This installs the skills, shared scripts, and a steering rule that teaches your agent to look up `@decision` annotations automatically.

> **Registry publishing coming soon.** Once published, you'll be able to install directly with `tessl install dld-kit/dld`.

#### Manual (Claude Code only)

Copy the `.claude/skills/` directory (including `dld-common/` and all `dld-*` skill directories) into your project's `.claude/skills/` folder:

```bash
cp -r /path/to/dld-kit/.claude/skills/dld-* your-project/.claude/skills/
```

Then add the following to your project's `CLAUDE.md` (or let `/dld-init` do it for you):

```markdown
## DLD (Decision-Linked Development)

This project uses Decision-Linked Development. Decisions are recorded in `decisions/` as individual markdown files.

### Rules

- When you encounter `@decision(DL-XXX)` annotations in code, use `/dld-lookup DL-XXX` to read the referenced decision BEFORE modifying the annotated code.
- ALWAYS look up and verify related decisions before modifying annotated code. Do not skip this step.
- NEVER modify code in a way that contradicts an existing decision without first confirming with the user. If the change requires breaking a previous decision, a new decision must be recorded (via `/dld-decide`) that explicitly supersedes the old one.
- Use `/dld-decide` to record new decisions
- Use `/dld-implement` to implement proposed decisions
- Use `/dld-lookup` to query decisions by ID, tag, or code path
```

### Quick start

**New feature or change** — use `/dld-plan` to break it down into decisions, then implement:
```
/dld-init              # Bootstrap DLD in your repo (run once)
/dld-plan              # Break it down into decisions interactively
/dld-implement DL-001  # Implement each decision (or batch related ones)
/dld-snapshot          # Generate overview docs from the decision log
```

For a small, isolated change (a bug fix, a single design choice), `/dld-decide` records one decision directly without the planning step.

**Existing codebase** — use `/dld-retrofit` to generate decisions from code that already exists:
```
/dld-init              # Bootstrap DLD in your repo (run once)
/dld-retrofit          # Analyze code, generate decisions and annotations
/dld-snapshot          # Generate overview docs from the decision log
```

This works as a standalone "document this codebase" action — you get structured decision records, code annotations, and a generated system overview. From there you can adopt the full workflow for future changes, or just re-run `/dld-audit-auto` and `/dld-snapshot` on a schedule to keep the documentation in sync as code evolves.

### The decision record

Each decision is a markdown file with YAML frontmatter:

```markdown
---
id: DL-008
title: "Use exponential backoff for payment gateway retries"
timestamp: 2026-02-15T09:20:00Z
status: accepted
supersedes: [DL-002]
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

## Skills

| Skill | Purpose |
|-------|---------|
| `/dld-init` | Bootstrap DLD in a repository (run once) |
| `/dld-decide` | Record a single decision interactively |
| `/dld-plan` | Break down a feature into multiple grouped decisions |
| `/dld-implement` | Implement proposed decisions — writes code, adds annotations, updates status |
| `/dld-lookup` | Query decisions by ID, tag, code path, or keyword |
| `/dld-status` | Overview of the decision log — counts, recent decisions, run tracking |
| `/dld-audit` | Scan for drift between decisions and code |
| `/dld-audit-auto` | Autonomous audit — detects drift, fixes issues, opens a PR (for scheduled/CI use) |
| `/dld-snapshot` | Generate SNAPSHOT.md (detailed reference) and OVERVIEW.md (narrative synthesis with diagrams) |
| `/dld-retrofit` | Bootstrap decisions from an existing codebase (broad or detailed mode) |

### Active workflow

The core DLD loop: developers record decisions via `/dld-decide` or `/dld-plan`, implement them with `/dld-implement`, and the framework maintains tight coupling between the decision log and code through `@decision` annotations. When an AI agent encounters an annotation, it reads the referenced decision before modifying the code. `/dld-audit` periodically checks for drift, and `/dld-snapshot` regenerates the derived specification from the decision log.

<img width="3180" height="2100" alt="DLD high-level workflow overview showing the decision log, code annotations, generated specification, and drift detection" src="https://github.com/user-attachments/assets/fc8b7804-10ce-439b-ba0c-1f431a26a46e" />

### Passive mode

For teams that want living documentation without changing how they work. Run `/dld-init` and `/dld-retrofit` once to bootstrap the decision log from an existing codebase, then schedule `/dld-audit-auto` and `/dld-snapshot` to run automatically (e.g. nightly via CI). The audit detects unreferenced code changes, infers new decisions, back-annotates the code, and the snapshot regenerates the spec — all without developers invoking any DLD commands during their normal workflow.

<img width="2880" height="2760" alt="DLD passive mode showing scheduled automation that keeps decisions and docs in sync without workflow changes" src="https://github.com/user-attachments/assets/36bba4e1-e8eb-4390-a484-f18f54638fa1" />

> **Note:** DLD doesn't include a scheduler. How you trigger the automated runs is up to you — [Claude Code's built-in cron support](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#2171), a CI pipeline step, or any other external scheduler all work.

## Project structure

### Flat mode (default)

```
dld.config.yaml
decisions/
  INDEX.md          # Auto-generated decision index
  SNAPSHOT.md       # Detailed per-decision reference
  OVERVIEW.md       # Narrative synthesis with Mermaid diagrams
  PRACTICES.md      # Development practices manifest (optional)
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
  billing/
    DL-001.md
    DL-004.md
    PRACTICES.md    # Namespace-specific practices (optional)
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
- **accepted** — implemented, code references this decision via annotations (immutable)
- **deprecated** — no longer relevant, no replacement
- **superseded** — replaced by a newer decision

## Concepts

### Practices manifest

An optional `decisions/PRACTICES.md` captures project development conventions (testing approach, code style, architecture patterns). The AI agent reads this when making and implementing decisions — it's most useful during `/dld-implement` where it directly influences how code is written.

### Spec as projection

The snapshot and overview documents are **generated, not maintained**. Like event sourcing read models, they're derived from the decision log and can be regenerated at any time. You maintain individual decisions; the framework derives the consolidated view.

### Drift detection

`/dld-audit` detects when code and decisions have drifted apart — orphaned annotations, stale references, modified annotated files that may need decision updates.

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

## License

[MIT](LICENSE)
