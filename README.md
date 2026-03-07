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

DLD is implemented as a set of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skills. All interaction happens through skill invocations.

### Installation

There's no installer or package distribution yet. To use DLD, manually copy the `.claude/skills/` directory (including `dld-common/` and all `dld-*` skill directories) into your project's `.claude/skills/` folder.

### Quick start

For a single, well-defined change (a bug fix, a specific design choice):
```
/dld-init              # Bootstrap DLD in your repo (run once)
/dld-decide            # Record a decision
/dld-implement DL-001  # Implement it — writes code, adds annotations
```

For a larger feature that involves multiple design choices:
```
/dld-plan              # Break it down into decisions interactively
/dld-implement DL-001  # Implement each decision (or batch related ones)
```

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
| `/dld-snapshot` | Generate SNAPSHOT.md (detailed reference) and OVERVIEW.md (narrative synthesis with diagrams) |
| `/dld-retrofit` | Bootstrap decisions from an existing codebase (broad or detailed mode) |

### Workflow

```
/dld-init (once)
    |
    +-- /dld-retrofit (existing codebases)
    |       |
    |       v
    |   /dld-snapshot
    |
    +-- /dld-decide  <--------------+
    |       |                       |
    |       v                       |
    |   /dld-implement -------------+
    |       |              (record more)
    |       v
    |   /dld-audit (periodic)
    |       |
    |       v
    |   /dld-snapshot (periodic)
    |
    +-- /dld-plan --> creates multiple decisions
            |         via /dld-decide logic
            v
        /dld-implement (for each)
```

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
