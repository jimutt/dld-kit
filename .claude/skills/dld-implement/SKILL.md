---
name: dld-implement
description: Implement one or more proposed decisions. Makes code changes, adds `@decision` annotations, and updates decision status.
user_invocable: true
---

# /dld-implement — Implement Decisions

You are implementing one or more `proposed` decisions by making code changes, adding `@decision` annotations, and updating the decision records.

## Script Paths

Shared scripts:
```
.claude/skills/dld-common/scripts/regenerate-index.sh
.claude/skills/dld-common/scripts/update-status.sh
```

Skill-specific scripts:
```
.claude/skills/dld-implement/scripts/update-references.sh
```

## Prerequisites

1. Check that `dld.config.yaml` exists at the repo root. If not, tell the user to run `/dld-init` first and stop.
2. Parse the user's input to identify which decision(s) to implement (e.g., `DL-005`, `DL-005 DL-006`, or a tag like `tag:payment-gateway`).
3. Read each referenced decision file. Verify they exist and have `status: proposed`. If a decision is already `accepted`, tell the user and skip it. If it doesn't exist, report the error.

## Read project context

1. Read `dld.config.yaml` for project structure
2. Read `decisions/PRACTICES.md` if it exists — **this is where practices guidance is most important**. Apply the project's testing approach, code style, error handling patterns, and architecture conventions when writing code.
3. For namespaced projects, also read `decisions/<namespace>/PRACTICES.md` for namespace-specific practices

## Implementation

### Batch vs. single implementation

When multiple decisions are requested, decide whether to implement them individually or as a batch:

- **Batch together** decisions that are tightly coupled — they touch the same code, share types, or depend on each other so heavily that implementing one without the others would produce incomplete or throwaway code (e.g., a data model + its validation + its state machine).
- **Implement separately** decisions that are independent — they touch different areas of the codebase and can stand on their own.

When batching, implement all the code together, add annotations for all decisions, then update each decision record and status individually in step 4.

### 1. Understand the decision(s)

Read each decision record carefully. Understand:
- What was decided
- The rationale and constraints
- The code areas referenced
- Any superseded decisions (read those too for context on what changed)

### 2. Make code changes

Implement the decision(s) by modifying the codebase. Follow the practices manifest if one exists.

**Refining decisions during implementation:** While implementing, you may discover details that weren't anticipated during planning — a specific threshold value, an edge case handling approach, or a refinement to the original design. Since the decision is still in `proposed` status, it is **mutable** and can be updated:

- **Small refinements** (implementation details, specific values, edge cases that don't change the decision's intent) — update the decision record inline. Amend the Decision, Rationale, or Consequences sections as needed. This is expected and encouraged.
- **Major discoveries** (a fundamentally different approach is needed, or an entirely new design concern surfaces) — stop and suggest the user run `/dld-decide` to record a separate decision. If the new discovery invalidates the current decision, it may need to be superseded instead.

The boundary: if the discovery changes the *intent* of the decision, it's a new decision. If it refines the *implementation details*, update the current one.

### 3. Add `@decision` annotations

Add `@decision(DL-NNN)` annotations to the code you modified or created. Place annotations in comments near the relevant code.

**Where to annotate:**
- Functions, methods, or classes that embody the decision
- Configuration or constants that were chosen based on the decision
- Key logic branches where the decision's rationale matters

**Annotation format** (adapt comment syntax to the language):
```typescript
// @decision(DL-012)
function calculateVAT(order: Order): Money {
  // ...
}
```

```python
# @decision(DL-012)
def calculate_vat(order: Order) -> Money:
    ...
```

**Guidelines:**
- Annotate at the declaration level, not every line
- One annotation per decision per code location
- Multiple decisions can annotate the same code: `// @decision(DL-012) @decision(DL-015)`
- Use the `annotation_prefix` from `dld.config.yaml` (default: `@decision`)

### 4. Update decision records

For each implemented decision:

1. **Update the `references` field** in the decision record's YAML frontmatter. Edit the file directly — add the code paths and symbols that were annotated. Example:
   ```yaml
   references:
     - path: src/billing/vat.ts
       symbol: calculateVAT
     - path: src/billing/vat.test.ts
   ```
   > **Fallback:** If direct editing is problematic, use the update-references script:
   > ```bash
   > cat > /tmp/refs-DL-NNN.yaml << 'EOF'
   > - path: src/billing/vat.ts
   >   symbol: calculateVAT
   > EOF
   > bash .claude/skills/dld-implement/scripts/update-references.sh DL-NNN /tmp/refs-DL-NNN.yaml
   > ```

2. **Update status** from `proposed` to `accepted`:
   ```bash
   bash .claude/skills/dld-common/scripts/update-status.sh DL-NNN accepted
   ```

### 5. Regenerate INDEX.md

```bash
bash .claude/skills/dld-common/scripts/regenerate-index.sh
```

### 6. Suggest next steps

> Implemented and accepted: **DL-NNN** (<title>)
>
> Code changes:
> - `src/billing/vat.ts` — modified `calculateVAT` (annotated with `@decision(DL-NNN)`)
> - `src/billing/vat.test.ts` — added tests
>
> Next steps:
> - `/dld-decide` — record another decision
> - `/dld-audit` — check for drift between decisions and code
