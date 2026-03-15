# Decision-Linked Development — FAQ

*Anticipated questions and honest answers.*

---

**How is this different from just using ADRs?**

ADRs are a strong foundation, and DLD intentionally aligns with ADR conventions. The key differences are: (1) DLD extends beyond architectural decisions to cover functional, product, and implementation-level decisions — anything that explains *why* code looks the way it does. (2) Decision records are tightly coupled to code via `@decision` annotations, serving as mechanical triggers for AI agents. (3) The consolidated spec is a generated projection from the decision log, borrowing from event sourcing, rather than a separate document someone has to maintain.

If your team already uses ADRs well, DLD is a natural evolution of that practice, not a replacement.

---

**How is this different from Spec-Driven Development?**

SDD treats the specification as the primary artifact and code as derivative. DLD inverts this: individual decisions are the primary artifact, and the spec is a derived view. The practical difference is that you never need to maintain a spec document — you maintain granular decisions, and the spec generates itself.

SDD also tends to optimize for the "create new feature" workflow. DLD is specifically designed for the long-term evolution problem: what happens after year one, when decisions accumulate, supersede each other, and the original authors have moved on.

---

**Won't this just create annotation noise everywhere in the code?**

Not every line of code needs a `@decision` reference. The annotations should appear where there's a non-obvious reason behind the implementation — the kind of thing where a developer (or AI agent) might otherwise think "this looks weird, let me refactor it" without understanding the context. Standard, idiomatic code that follows obvious patterns doesn't need decision references.

Think of it as: if you'd write a code comment explaining *why* something works a certain way, that's probably a good candidate for a `@decision` reference instead. You get the same signal to pause and think, but with a link to the full context rather than a one-line comment that will inevitably go stale.

---

**Isn't this just glorified code comments?**

Code comments explain *what* or *how*. Decision references point to a structured record that captures *why*, including the context, constraints, alternatives considered, and relationship to other decisions. A comment like `// Safari fix` tells you almost nothing. A `@decision(DL-047)` reference links to a record explaining what the Safari issue was, which customers were affected, what alternatives were evaluated, and whether this decision has since been superseded.

The structured record also enables tooling: AI agents can automatically look up decisions, projections can be generated, and you can trace which decisions are still active vs. deprecated.

---

**What if the LLM-generated projection/snapshot gets something wrong?**

It will, sometimes. That's expected and by design. The projection is explicitly a convenience view — a summarized read model, not the source of truth. The individual decision records always win. Think of it like a database materialized view: useful for quick reads, but you don't modify the view directly, and you accept that it may lag slightly behind the actual data.

If a projection error is significant, the right fix is to either clarify the underlying decision record or create a new decision that supersedes the ambiguous one.

---

**How much overhead does this add to development?**

The goal is for this to be lighter than maintaining a spec, not heavier. Writing a decision record should take a few minutes — it's a short markdown file with a template. The key difference from traditional documentation is that you're writing decisions *as they happen*, when the context is fresh, not trying to retroactively document a system months later.

The annotations in code are one-liners. And the projection is generated, so that's zero maintenance effort.

The real question is whether the time spent writing decisions is offset by the time saved when you (or an AI agent) don't have to reverse-engineer *why* something was done a certain way. Based on the experience of teams using ADRs, the answer is generally yes — especially as team composition changes over time.

---

**How do you bootstrap this for an existing codebase?**

You don't need to document every historical decision on day one. Start with the areas of the codebase that are most frequently misunderstood, most often touched by AI agents, or most likely to cause problems if modified without context. Create decision records for those areas first and add the corresponding `@decision` annotations.

Over time, you can expand coverage. You can also use AI to help bootstrap: have an LLM analyze git history, PR descriptions, and the code itself to propose candidate decisions, which humans then review and refine.

---

**What if a decision turns out to be wrong?**

You don't edit or delete the original decision. If the original decision is entirely wrong, you create a new decision that supersedes it, explaining why the previous approach is no longer valid. If only part of it needs to change, you create a new decision that *amends* it — the original stays active, and the amendment clarifies what changed. This preserves the full history — which is valuable both for understanding how the system evolved and for preventing the same mistake from being repeated.

---

**Does this work for small projects or is it only for large systems?**

For a small, greenfield project with one developer, this is probably overkill. Traditional SDD or even just good code comments may be sufficient.

DLD starts paying off when: the codebase will evolve over a long period, multiple people (or AI agents) will work on it, the code contains non-obvious implementation choices driven by external factors, or there's a risk of institutional knowledge being lost through team changes.

---

**Why not just have the AI agent search Jira/Slack/PRs for context?**

You could, and some teams do. The problems are: (1) it's slow and expensive in tokens, (2) the relevant context is scattered across multiple tools in unstructured formats, and (3) the AI has no way to know *which* Jira ticket or Slack thread is relevant to the specific line of code it's modifying.

DLD's `@decision` annotations solve the discovery problem by explicitly linking code to its relevant context. And the decision record format ensures the context is captured in a structured, accessible way.

---

**Can this coexist with Spec-Driven Development?**

You wouldn't need SDD alongside DLD — DLD is intended to replace that workflow, not complement it. For larger new features, you'd use an LLM-assisted skill or command that helps break down the feature into a set of reasonably sliced decisions. The planning phase that SDD provides is still there, but the output is decisions in the log rather than a separate spec document. This means the planning work directly feeds the long-term knowledge base instead of producing artifacts that need separate maintenance.

For smaller chunks of work — a bugfix, a minor refactor — you'd use a simpler command that helps you record a single decision capturing that more isolated change. In both cases, the LLM assists with structuring and storing the decision well, but the decision log remains the single system of record.

---

**What tooling would be needed to make this practical?**

At minimum: a decision record template, a convention for `@decision` annotations, and instructions in CLAUDE.md (or equivalent) telling the AI agent to look up referenced decisions before modifying annotated code. That's enough for a prototype.

More mature tooling could include: a CLI for creating and querying decisions, automated projection generation, IDE integration that shows decision context on hover, CI checks that warn when annotated code is modified without reviewing the referenced decisions, and dashboards showing decision coverage across the codebase.

---

**We already use conventional commits with Jira references. Isn't that enough?**

It's a good start, and better than nothing, but there are a few important gaps. First, while a good Jira ticket *should* capture the reasoning behind a change, the bigger problem is one of aggregation over time. A method that has been touched by fifteen commits over two years, each referencing a different Jira ticket, creates a trail that is technically traceable but practically unusable. Nobody — human or AI — is going to look up every historical commit that touched a method and read through all the related Jira discussions to piece together the full picture. A `@decision` annotation gives you the relevant context directly, without the archaeology.

Second, the link between a Jira ticket and the code it affected degrades quickly. A commit references a ticket, but six months later when someone modifies that method, they're looking at the code, not running `git log` on every file they touch. And even if they did, the commit that introduced the logic may have been followed by ten more commits that touched the same lines for unrelated reasons. The trail goes cold fast.

Third, and most critically for AI-assisted development: an LLM working with your code has no practical way to trace from a method it's about to modify back through git history to find the relevant Jira ticket and then parse the discussion thread for context. A `@decision(DL-047)` annotation on the method gives it a direct, unambiguous pointer to a structured record it can read in seconds.

Conventional commits and Jira references are useful for audit trails and release notes. DLD is solving a different problem: making sure the reasoning behind implementation choices is accessible at the point where it matters — in the code, at the moment someone (or something) is about to change it.

---

**What about decisions that happen in hallway conversations or meetings without notes?**

This is one of the biggest sources of lost context in any codebase, and DLD is designed to address it structurally. The core idea is that code changes are made through commands provided by the DLD framework, which collect enough context from the developer to produce a good decision record *before* the code change proceeds. The decision gets captured when it's fresh — not retroactively, not in a meeting summary nobody reads.

Of course, people will sometimes bypass the workflow — a quick hotfix, a change through a different tool. To catch these gaps, DLD includes a scheduled audit process that scans recent commits, identifies changes to annotated code that weren't accompanied by decision updates, and flags new non-trivial logic that lacks decision references. The goal isn't to block anyone, but to surface undocumented changes while the context is still recoverable.

---

**Has anyone actually tried this?**

Not this exact combination, as far as we can tell from research. The individual pieces exist: ADRs are widely adopted, the e-adr project demonstrated code-level annotations in Java, and event sourcing is a well-understood pattern. But the specific combination of an append-only decision log, code-level annotations designed as AI agent triggers, and LLM-generated spec projections appears to be novel. The next step is to prototype it and find out what works and what doesn't.
