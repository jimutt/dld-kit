# Decision-Linked Development (DLD)

## A Framework for Preserving Decision Context in AI-Assisted Software Evolution

*Jimmy — Draft concept paper, March 2026*

---

## The Problem

As AI coding agents become increasingly capable at generating and modifying code, a critical gap is emerging: the loss of *decision context* — the reasoning behind why code exists in its current form. This isn't a new problem, but AI-assisted development is accelerating it in dangerous ways.

In any sufficiently mature codebase, the quirks and idiosyncrasies of the implementation are rarely purely technical in nature. They are shaped by a combination of factors: in-the-moment engineering judgment calls, functional requirements driven by specific customer situations ("because of 20 customers in state Y, it needs to work like this"), time constraints where a larger refactor was deemed too risky, and countless other external pressures that shaped the code into what it is today.

If these quirks were solely technical, LLMs would eventually handle them fine. But the external factors — the *why* behind the decisions — are often not documented anywhere in writing, or they're scattered across Jira tickets, Slack threads, PR discussions, and meeting notes in formats that are not readily accessible to AI agents.

The risk I see is this: **human knowledge of these decisions is eroding faster than the environment is adapting to support AI-driven development processes.** As experienced engineers leave teams or move on, and as AI agents take on more of the implementation work, we're losing the institutional knowledge that guided the code into its current shape — without having captured it in a form that can inform future changes.

Michael Nygard captured the human side of this problem back in 2011: "One of the hardest things to track during the life of a project is the motivation behind certain decisions. A new person coming on to a project may be perplexed, baffled, delighted, or infuriated by some past decision" ([Documenting Architecture Decisions, 2011](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions)). What's changed since then is that the "new person" is increasingly an AI agent — and an AI agent doesn't get perplexed, it just confidently gets it wrong.

## Why Current Approaches Fall Short

### The LLM Intuition Gap

Humans have an intuitive sense for when to pause and think: "Wait, could I be missing something here?" An experienced developer modifying a seemingly straightforward method might notice something slightly unusual about the implementation and instinctively check git blame, the related Jira ticket, or ask a colleague before making changes.

LLMs don't have this intuition. They will confidently modify code based on pattern matching and the immediate context available to them. A workaround is to have the LLM aggressively query external knowledge sources — pulling in old Jira tickets, checking discussions in previous PRs, scanning Slack history — for essentially every change. But this approach is both slow and extremely wasteful from a token spend perspective. It doesn't scale.

### Spec-Driven Development: Promising but Incomplete

Spec-Driven Development (SDD) has gained significant traction as an approach to giving AI agents better context. The core idea — write the specification first, then let AI implement against it — is sound. However, most current SDD approaches have significant limitations when applied to real-world software evolution. Birgitta Böckeler, writing on martinfowler.com, found similar concerns when evaluating SDD tools: agents ignored existing code descriptions and regenerated duplicates, or went overboard following instructions too eagerly. She also noted the fundamental difficulty of separating functional from technical specs, observing that "we don't have a good track record as a profession to do this well" ([Understanding Spec-Driven-Development, 2025](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)).

**The greenfield bias.** Most SDD frameworks are optimized for enabling autonomous LLM development of larger chunks of new work: one-shotting more complex solutions while reducing the risk of partial implementations or deviations from the original intent. This works reasonably well for greenfield projects. Where it falls apart is when you move past initial development into software that will evolve naturally over time — which is what *all* successful software does.

**The slicing problem.** Defining the perfect decomposition of your spec from day one is almost as hard as defining the perfect architecture for your code that will withstand the trials of time without requiring major rework. But this is what many SDD methods consider out of scope or leave for the user to figure out. Over time, what started as two separate specifications or user stories may develop so much overlap that maintaining them as separate artifacts creates a significant burden.

**The spec maintenance burden.** We have extensive historical evidence — long predating AI-assisted development — that maintaining specification documents over time is extremely difficult for any product that isn't final in its first version. And almost all successful software changes and evolves over time. As the Augment Code team acknowledges: "For brownfield codebases, creating specifications accurate enough for AI generation requires reverse-engineering years of implicit business logic. AI-assisted code comprehension tools typically provide better value than full SDD approaches for maintenance-focused work" ([What Is Spec-Driven Development?, 2026](https://www.augmentcode.com/guides/what-is-spec-driven-development)).

**The portability fallacy.** Many SDD approaches emphasize a strict separation between the functional specification and the technical implementation, arguing that the spec should be technology-agnostic. I believe this is analogous to the portability argument for ORMs ("we should be able to switch our underlying database"). In practice, this "just in case" abstraction rarely pays off but introduces real costs: suboptimal implementations, harder-to-understand layers of indirection, and a disconnect between where the knowledge lives and where it's needed.

The same pattern has played out with the SOLID principles in software engineering. Over time, more and more experienced developers have moved away from treating these as universal best practices, recognizing that premature abstractions often create systems that are harder to reason about than the direct implementations they replaced.

It is extremely naïve to believe that the challenges of managing how a system's requirements change over time will disappear just because you switched from a deterministic, low-abstraction language for the spec (code) to a more verbose and vague one (human language).

## The Proposed Solution: Decision Log Driven Development

### Core Concept

Instead of treating a specification document as the primary artifact, DLD places an append-only **decision log** at the center. Each entry in this log captures a discrete decision: what was decided, why, when, what it supersedes, and what code it relates to.

The key insight is borrowed from **event sourcing**: rather than maintaining a mutable "current state" document (a traditional spec) that loses its history with each edit, we maintain the full stream of decisions as events whose content is immutable once accepted (metadata like status and code references can be updated mechanically). The "current specification" becomes a **derived projection** — generated from the decision log, never manually maintained.

### The Decision Record

Building on the established terminology and concepts from Architecture Decision Records (ADRs) — originally proposed by Michael Nygard in 2011 and further formalized by Zdun et al. in their work on sustainable architectural decisions ([Sustainable Architectural Design Decisions, IEEE Software, 2013](https://www.researchgate.net/publication/259470965_Sustainable_Architectural_Design_Decisions)) — each decision in the log should capture:

- **ID and timestamp** — when the decision was made
- **Status** — proposed, accepted, deprecated, superseded
- **Context** — the situation, constraints, and forces at play
- **Decision** — what was decided
- **Rationale** — why this choice over alternatives
- **Consequences** — what becomes easier or harder
- **Supersedes** — references to previous decisions that this one fully replaces. A single new decision may supersede one or several older decisions.
- **Amends** — references to previous decisions that this one partially modifies. Unlike supersession, amended decisions stay active — the amendment changes part of the original's scope while the rest remains in effect.
- **Code references** — explicit links to the areas of the codebase this decision affects

By aligning with ADR conventions and terminology, DLD lowers the adoption barrier for teams already familiar with architectural decision records, while extending the concept to cover not just architectural but also functional, product, and implementation-level decisions.

### Tight Coupling to Code

This is where DLD diverges most sharply from traditional SDD and even from conventional ADR practices. **Individual decisions should have a tight, explicit connection to corresponding areas in code.**

The idea of embedding decision knowledge directly in code is not entirely new. The **e-adr** project ([github.com/adr/e-adr](https://github.com/adr/e-adr)) pioneered this for Java, providing `@ADR` and `@MADR` annotations that let developers reference architectural decisions from classes and methods. Academic research on feature traceability has also shown that embedded code annotations have surprisingly low maintenance cost because "they naturally co-evolve with the assets" ([Maintaining Feature Traceability with Embedded Annotations, SPLC 2015](https://dl.acm.org/doi/10.1145/2791060.2791107)). However, these efforts predate AI coding agents and were designed primarily for human consumption. DLD extends this concept with a fundamentally different design motivation: the annotation serves as a **mechanical trigger for the LLM**, not just documentation for humans.

In practice, this coupling is achieved through code comments or annotations at the method or class level:

```java
// @decision(DL-047) Safari rendering micro-optimization
// @decision(DL-012) Customer-specific VAT rounding for EU trade
public BigDecimal calculateVAT(Order order) {
    // ...
}
```

```python
# @decision(DL-091) Supersedes DL-034, DL-056
# Rate limiting uses token bucket, not sliding window,
# due to Fastly edge constraints discovered in DL-034
class RateLimiter:
    pass
```

Why this tight coupling matters:

1. **Mechanical LLM trigger.** When an AI agent encounters a `@decision` annotation while modifying code, it has an explicit signal to look up the referenced decision before proceeding. This transforms "the LLM should intuitively know to check context" from a hope into a reliable trigger.

2. **Reduced token waste.** Instead of blindly querying every possible knowledge source for every change, the agent only needs to fetch the specific decisions referenced in the code it's modifying. This is targeted and efficient.

3. **Proximity principle.** The decision context lives where it's needed — right next to the code it explains. A developer (human or AI) reading the code immediately sees that there's a decision behind this implementation and can look it up.

4. **Drift detection.** If decisions are referenced in code, it's straightforward to detect when code changes might conflict with existing decisions, or when decisions have been superseded but the code hasn't been updated.

### Decision References in Tests

Decision log entries should also be referenced in unit tests and integration tests:

```python
class TestVATCalculation:
    """
    @decision(DL-012) EU trade VAT rounding rules
    @decision(DL-047) Safari rendering edge case
    """
    def test_swedish_vat_rounding(self):
        # ...
```

In an ideal world with full test coverage, you could argue that the decision references only need to live in the tests. However, I would not want to limit the framework to test-only references, because there are contexts — certain types of frontend code, highly subjective UX decisions, browser-specific micro-optimizations — where meaningful test coverage of the decision-level logic is difficult or counterproductive to achieve. In those cases, the inline code annotation remains the primary link.

### The Projection: Spec as Derived Artifact

One of the major problems with a sequential decision log is that reading through potentially years of individual decisions would be an unpleasant and unproductive task for a human. This is where the event-sourcing analogy becomes directly actionable.

Just as event-sourced systems build **snapshots and read models** by replaying events up to a certain point in time, we can generate consolidated specification views from the decision log:

- **A scheduled task** (weekly, monthly, or after every N new decisions) triggers an LLM to parse the recent updates and generate a new consolidated snapshot of the current system specification.
- **The full detailed snapshot** represents the complete current state of all active decisions, organized by domain or component.
- **Summary views** can be derived from the snapshot: changes from the last month, a high-level overview that covers baseline functionality without edge cases, a view for new team members, etc.

These projections are explicitly secondary artifacts. They are **convenience views that may have slight inconsistencies.** The individual decision entries in the log always remain the authoritative source of truth. If there's ever a conflict between the projected spec and the decision log, the decision log wins.

This approach has a crucial advantage: you don't need to worry about perfectly consolidating and restructuring your specification over time. You can do it if you want — by creating a new decision that supersedes several old ones — but the system doesn't require it. The projection handles the consolidation automatically, and the log remains an honest, complete record of how the system evolved.

Recent work on scaling AI agent context supports the need for this kind of tiered knowledge architecture. A 2026 paper on "Codified Context" documents a project where a single CLAUDE.md file evolved into a 26,000-line context infrastructure with hot/cold memory separation and domain-expert agents across 283 development sessions ([Codified Context: Infrastructure for AI Agents in a Complex Codebase, 2026](https://arxiv.org/html/2602.20478v1)). DLD's decision log with generated projections offers a more structured path to this kind of knowledge scaling, with the event-sourcing model providing a natural mechanism for growth over time.

### The Layered Spec Problem

To be fair to current SDD approaches, many of them do go beyond tech-agnostic PRDs. A typical SDD workflow will produce layered specification artifacts: a high-level PRD that is intentionally technology-agnostic, and then more detailed technical specs or implementation specs that sit at a lower abstraction level, capture edge cases, and are very much tied to the specific tech stack. So the critique here is not that SDD only produces abstract, agnostic documents — it doesn't.

But in my view, this layering almost makes the long-term maintenance problem *worse*, not better. You end up with multiple specification artifacts at different abstraction levels that all need to be kept in sync:

- The PRD describes the high-level intent.
- The technical spec describes how it should be implemented.
- The code is the actual implementation.

When a change happens — a new edge case is discovered, a customer-specific requirement shifts, an infrastructure constraint forces a different approach — which layer do you update first? All of them? In practice, the code gets updated because it has to, the tech spec might get updated if someone remembers, and the PRD almost certainly drifts. Over time, you accumulate layers of partially-stale documentation at different abstraction levels, each telling a slightly different story about the same system.

DLD sidesteps this layering problem entirely. There is one authoritative source: the decision log. Each decision captures the *why* at whatever abstraction level is natural for that particular decision — some decisions are high-level product choices, others are low-level implementation details driven by infrastructure constraints. They all live in the same flat, sequential log, differentiated by their content rather than by which document tier they belong to. The projected specification can then present different views of this data at different abstraction levels, but these views are generated, not manually maintained.

The decision log also embraces tight coupling between decisions and code rather than fighting it. It captures the *why* (which is genuinely portable and valuable regardless of tech stack), while the code references ensure the *why* stays connected to the *what* in a way that both humans and AI agents can follow.

## How It Would Work in Practice

### Workflow: Decision Before Code

A common failure mode in any documentation practice is that the documentation happens *after* the fact — or not at all. The hallway conversation, the quick hotfix, the meeting decision that never made it into writing. DLD addresses this by making the decision record a **prerequisite to the code change**, not an afterthought.

In practice, this means that changes to the codebase are made through commands provided by the DLD framework. Whether breaking down a larger feature into a set of decisions or recording a single bugfix, the workflow collects enough context from the developer to produce a good decision record *before* the code change proceeds. The LLM assists with structuring the decision, suggesting appropriate references to existing decisions, and identifying relevant areas of the codebase — but the developer provides the *why*.

This doesn't mean every trivial change requires a formal decision record. The framework should distinguish between changes that warrant a decision (non-obvious implementation choices, edge cases, constraint-driven workarounds) and routine changes that don't (formatting, dependency bumps, straightforward bug fixes with obvious causes).

### Drift Detection: Catching Undocumented Changes

No workflow is followed perfectly 100% of the time. Developers will occasionally bypass the framework — a quick hotfix pushed directly, a change made through a different tool, or a merge that modifies annotated code without updating decision references.

To address this, DLD should include a **scheduled audit process** that runs periodically (or as a CI step) and:

- Scans commits since the last audit for changes to code that carries `@decision` annotations, flagging any modifications that weren't accompanied by a review or update of the referenced decisions.
- Identifies new logic or methods that appear to involve non-trivial implementation choices but lack any decision references.
- Detects potential violations of existing decisions — for example, a change that contradicts the approach documented in an active decision record.

This isn't about blocking or punishing developers. It's about surfacing gaps so they can be addressed while the context is still fresh, rather than discovering months later that a critical piece of reasoning was never captured.

### For Existing Codebases (Bootstrapping)

For brownfield codebases without an existing decision log, bootstrapping is a knowledge extraction exercise. The approach would involve:

- Mining git history, PR descriptions, and commit messages for implicit decisions
- Scanning Jira/Linear/etc. for tickets that influenced architectural or implementation choices
- Conducting knowledge transfer sessions with experienced team members
- Having an LLM analyze the codebase and propose candidate decisions based on patterns it identifies

This doesn't need to be exhaustive from day one. Start with the most critical or most frequently misunderstood areas of the codebase and expand coverage over time.

## Relationship to Existing Concepts

DLD builds on several established practices:

- **Architecture Decision Records (ADRs):** The foundational concept, introduced by [Michael Nygard in 2011](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions) and adopted widely (ThoughtWorks placed ADRs in their "Adopt" radar category; AWS, Microsoft, and Google Cloud all publish ADR guidance). ADRs already support superseding and cross-linking. DLD extends ADRs beyond architectural decisions to cover functional, product, and implementation-level decisions, while adding the event-sourcing projection model and tight code coupling. The comprehensive [ADR community resources at adr.github.io](https://adr.github.io) provide a solid foundation for the record format.
- **Embedded ADRs (e-adr):** The [e-adr project](https://github.com/adr/e-adr) pioneered code-level ADR annotations in Java, allowing `@ADR(n)` references on classes and methods. DLD extends this concept to be language-agnostic (using comment-based annotations rather than Java-specific constructs) and AI-agent-aware (the annotations serve as mechanical triggers for LLM context lookup).
- **Vibe ADR:** Owen Zanzal's ["Vibe ADR" concept](https://medium.com/devops-ai/vibe-adr-building-with-intention-in-the-age-of-ai-d01e93f36696) similarly positions decision records as "living nodes of intent" that both humans and AI can understand, with each ADR linked to relevant commits. DLD shares this spirit but adds the event-sourcing projection model and deeper code-level coupling.
- **OpenSpec:** The [OpenSpec framework](https://openspec.dev/) is the most relevant SDD tool to compare against, because it shares DLD's brownfield-first philosophy and uses a delta-based approach where changes are described as incremental modifications (ADDED/MODIFIED/REMOVED) rather than restating the entire spec. OpenSpec also maintains a "source of truth" specification that delta specs merge into during an archive step — conceptually similar to DLD's projection, though manually triggered rather than generated. The key differences: OpenSpec's unit of work is a *feature change* (proposal → specs → design → tasks), while DLD's unit is a *decision*. Most importantly, OpenSpec has no direct connection between its specifications and the code they describe — specs live in a separate directory structure organized by capability, and the AI agent has to infer which specs are relevant to the code it's modifying. DLD's `@decision` annotations create an explicit, mechanical link from code to decisions, which is the core design choice that makes the framework work as an AI agent trigger rather than just documentation. OpenSpec also still requires maintaining a consolidated spec document (via a manual archive step), whereas DLD generates it. That said, OpenSpec's delta model and archive workflow demonstrate that the incremental approach to specification works in practice, which validates a core assumption behind DLD.
- **Spec-Driven Development (general):** As formalized by tools like [GitHub Spec Kit](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/), [Kiro](https://kiro.dev/blog/kiro-and-the-future-of-software-development/), and others. DLD shares the goal of giving AI agents better context but inverts the relationship — the spec is derived from decisions rather than being the primary artifact. See also the thorough [academic survey of SDD](https://arxiv.org/html/2602.00180v1) (2026) for a comprehensive taxonomy of spec-first, spec-anchored, and spec-as-source approaches.
- **Event Sourcing / CQRS:** The decision log is an append-only event stream; the projected specification is a read model / materialized view. This pattern is well-established in application architecture and is increasingly being applied to AI agent state management (see [Event Sourcing: The Backbone of Agentic AI](https://akka.io/blog/event-sourcing-the-backbone-of-agentic-ai)).

## Open Questions and Next Steps

- **Granularity:** Not every line of code traces back to a discrete decision. How do we find the right level of annotation density without creating noise?
- **Tooling:** What does the ideal CLI / IDE integration look like for this workflow?
- **Projection quality:** How do we ensure the LLM-generated snapshots faithfully represent the decision log without losing nuance? What validation mechanisms are needed?
- **Team adoption:** How do we make writing decision records feel lightweight enough that developers actually do it, rather than treating it as overhead?
- **Prototype scope:** What's the minimal viable version of this framework that could be tested on a real project?

---

*This document formalizes ideas developed through conversation, reflection, and a review of existing approaches in the ADR, SDD, and AI-assisted development spaces. While individual elements of this framework exist in various forms — decision records, code annotations, event sourcing patterns, AI context management — the specific combination proposed here does not appear to have been implemented as an integrated framework. The next step is to prototype a working version targeting Claude Code as the primary development tool.*
