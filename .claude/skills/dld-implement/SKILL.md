---
name: dld-implement
description: Implement one or more proposed decisions. Makes code changes, adds @decision annotations, and updates decision status.
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

### 1. Understand the decision(s)

Read each decision record carefully. Understand:
- What was decided
- The rationale and constraints
- The code areas referenced
- Any superseded decisions (read those too for context on what changed)

### 2. Make code changes

Implement the decision(s) by modifying the codebase. Follow the practices manifest if one exists.

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

For each implemented decision, write the references to a temp file and pass it to the update script:
```bash
cat > /tmp/refs-DL-NNN.yaml << 'EOF'
- path: src/billing/vat.ts
  symbol: calculateVAT
- path: src/billing/vat.test.ts
EOF
bash .claude/skills/dld-implement/scripts/update-references.sh DL-NNN /tmp/refs-DL-NNN.yaml
```

Then update the status from `proposed` to `accepted`:
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
