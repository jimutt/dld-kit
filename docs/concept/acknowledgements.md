# Acknowledgements

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

See the [concept paper](dld-concept.md) for a detailed discussion of how DLD relates to these approaches.
