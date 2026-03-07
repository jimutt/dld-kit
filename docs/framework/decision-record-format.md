# Decision Record Format

## File Structure

Each decision is a single markdown file with YAML frontmatter for structured metadata and a markdown body for context and rationale.

### File Naming

Files are named by their sequential ID: `DL-001.md`, `DL-002.md`, etc.

IDs are globally sequential across the entire project, even when namespaces are used. This keeps `@decision(DL-XXX)` annotations simple and allows cross-referencing across namespaces without ambiguity.

### Directory Layout

Determined by project configuration (see `dld.config.yaml`).

**Flat (small projects):**
```
decisions/
  DL-001.md
  DL-002.md
  DL-003.md
```

**Namespaced (monorepos / multi-component projects):**
```
decisions/
  billing/
    DL-001.md
    DL-004.md
  auth/
    DL-002.md
    DL-005.md
  shared/
    DL-003.md
```

In namespaced mode, each decision belongs to exactly one namespace. The namespace is organizational — it does not affect the ID or how the decision is referenced in code.

## Decision Record Schema

### YAML Frontmatter

```yaml
---
id: DL-001
title: "Short descriptive title"
timestamp: 2026-03-07T14:30:00Z
status: accepted          # proposed | accepted | deprecated | superseded
supersedes: []            # e.g. [DL-003, DL-007] — decisions this one replaces
namespace: billing        # optional — only in namespaced projects
tags: []                  # optional — used for grouping, filtering, and search
references:               # code areas this decision affects
  - path: src/billing/vat.ts
    symbol: calculateVAT  # optional — function, class, or method name
  - path: src/billing/vat.test.ts
---
```

#### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Global sequential ID (`DL-NNN`) |
| `title` | yes | Short, descriptive title |
| `timestamp` | yes | ISO 8601 timestamp of when the decision was made |
| `status` | yes | One of: `proposed`, `accepted`, `deprecated`, `superseded` |
| `supersedes` | no | List of decision IDs this one replaces |
| `namespace` | no | Namespace this decision belongs to (namespaced projects only) |
| `tags` | no | Tags for grouping related decisions, categorization, and filtering. When a larger feature is planned as multiple decisions, a shared tag (e.g., `payment-gateway`) groups them together. |
| `references` | no | Code locations this decision affects |

#### Status Lifecycle

```
proposed → accepted → deprecated
                    → superseded (by a newer decision)
```

- **proposed** — Intent recorded, but no implementation yet. Proposed decisions are **mutable** — they can be refined or updated as understanding evolves during implementation. This is the drafting phase where the decision takes shape.
- **accepted** — Active and in effect. Code references this decision via `@decision` annotations. Once accepted, a decision becomes **immutable** — its content is never modified. If the decision needs to change, record a new decision that supersedes it.
- **deprecated** — No longer relevant (e.g., the feature was removed). No replacement decision.
- **superseded** — Replaced by one or more newer decisions. The superseding decision(s) will list this ID in their `supersedes` field.

When a decision is superseded, its status is updated to `superseded` — this is the one exception to the append-only principle for accepted decisions. Once a decision reaches `accepted` status, its content is never modified, only the status field. (Decisions in `proposed` status are still mutable and can be freely refined.) The superseding decision carries the full context of what changed and why.

#### Code References

References link decisions to code at the file or symbol level:

- `path` is relative to the project root
- `symbol` is optional — use it when the decision applies to a specific function, class, or method rather than an entire file
- Avoid line numbers — they rot immediately

These references serve two purposes:
1. The decision record documents which code it affects (decision → code)
2. `@decision()` annotations in the code point back (code → decision)

Both directions should be maintained, but the in-code annotations are the primary trigger for AI agents.

### Markdown Body

The body uses a consistent heading structure. Not all sections are required for every decision — a minor bugfix rationale needs less detail than a major architectural choice.

```markdown
## Context

The situation, constraints, and forces at play. What prompted this decision?

## Decision

What was decided. Be specific and concrete.

## Rationale

Why this choice over alternatives. What alternatives were considered and why were they rejected?

## Consequences

What becomes easier or harder as a result of this decision. Known tradeoffs.
```

#### Section Guidance

| Section | When to include |
|---------|----------------|
| Context | Always — even a sentence or two helps |
| Decision | Always |
| Rationale | When the choice isn't obvious, or alternatives were considered |
| Consequences | When there are meaningful tradeoffs or downstream effects |

## Complete Example

```markdown
---
id: DL-012
title: "Customer-specific VAT rounding for EU trade"
timestamp: 2026-02-15T09:20:00Z
status: accepted
supersedes: [DL-003]
namespace: billing
tags: [vat, eu-compliance, rounding]
references:
  - path: src/billing/vat.ts
    symbol: calculateVAT
  - path: src/billing/vat.test.ts
    symbol: TestVATCalculation
---

## Context

~20 customers in the Swedish EU trade scenario require VAT rounding to use banker's rounding (round half to even) rather than standard commercial rounding. This is driven by Swedish tax authority guidelines for intra-EU trade invoices. Standard rounding causes sub-cent discrepancies that trigger reconciliation failures in their ERP systems.

## Decision

Apply banker's rounding (IEEE 754 round-half-to-even) for all VAT calculations on orders flagged with EU intra-community supply. This replaces the previous approach (DL-003) which applied a flat 2-decimal truncation.

## Rationale

- Banker's rounding is the standard recommended by the Swedish Tax Agency for intra-EU invoices
- Truncation (DL-003) solved the immediate reconciliation issue but introduced a systematic downward bias that accumulated over high-volume accounts
- We considered per-customer rounding configuration but the complexity wasn't justified — all affected customers fall under the same tax authority guidance

## Consequences

- VAT amounts may differ by ±0.005 SEK from the previous implementation for affected orders
- Non-EU orders are unaffected
- The rounding logic is now coupled to the EU trade flag on the order, which must be set correctly upstream
```
