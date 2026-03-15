# Decision-Linked Development (DLD)

### A better way to keep AI coding agents from breaking your codebase

---

**The problem:** AI coding agents are getting really good at writing code. What they're terrible at is knowing *why* your code looks the way it does. That weird rounding logic? It exists because of 20 customers in a specific EU trade scenario. That suboptimal query pattern? Forced by an infrastructure constraint discovered six months ago. These decisions live in people's heads, old Jira tickets, and buried Slack threads — not where an LLM can find them when it's about to refactor your method.

**Why this matters now:** Human knowledge of these decisions is eroding faster than our tooling is adapting. As AI takes on more implementation work and teams change over time, we're losing the institutional context that prevents confident-but-wrong code changes.

**Why Spec-Driven Development isn't enough:** SDD optimizes for greenfield. For evolving systems, you end up with layered spec documents at different abstraction levels that drift out of sync with each other and with the code. Maintaining specs over time is a problem we've failed to solve for decades — even before AI entered the picture.

**The idea:** Borrow from event sourcing. Instead of a mutable spec document, maintain an **append-only decision log** where each entry captures *what* was decided, *why*, and *what code it affects*. Decisions can supersede previous ones — including multiple at once — creating a complete timeline of how the system evolved.

**The core design choice** is deliberately tight coupling between decisions and code. This goes against the instinct to keep specs and implementation separate — an instinct I think is misguided for the same reasons the "we might switch databases" argument for ORMs is misguided. The decision context needs to live *where the code is*, not in a separate document the AI agent may or may not find.

In practice, `@decision(DL-XXX)` annotations on methods and classes act as mechanical triggers: when an AI agent encounters one, it knows to look up the referenced decision *before* modifying anything. No intuition required. No expensive trawling through Jira and Slack history. Just a direct pointer from code to the reasoning behind it.

Three additional design choices support this:

1. **The decision log is append-only.** Decisions can supersede (fully replace) or amend (partially modify) previous ones — but the content (reasoning and intent) is never rewritten. Metadata like `status` and `references` can be updated mechanically (e.g., after code refactors). This creates a complete timeline of how the system evolved, borrowing directly from event sourcing.

2. **The spec is a generated projection**, not a manually maintained document. Just like event sourcing builds read models from event streams, an LLM periodically generates a consolidated "current state" snapshot from the decision log. Humans never maintain the spec — only the individual decisions.

3. **One flat log, no abstraction layers.** High-level product decisions and low-level implementation details live in the same sequential log. Different views (summary, detailed, changelog) are derived, not manually managed.

**Built on established ground:** The decision record format aligns closely with Architecture Decision Records (ADRs), a well-established practice. DLD extends ADRs with the event-sourcing model, code-level coupling, and AI-agent-aware design.