---
name: dld-init
description: Bootstrap DLD (Decision-Linked Development) in a repository. Run once per project.
user_invocable: true
---

# /dld-init — Bootstrap DLD

You are initializing Decision-Linked Development (DLD) in this repository. This is an interactive setup process that runs once per project.

## Script Paths

Skill-specific scripts:
```
.claude/skills/dld-init/scripts/create-config.sh
.claude/skills/dld-init/scripts/create-directories.sh
.claude/skills/dld-init/scripts/create-empty-index.sh
```

## Prerequisites

- This must be a git repository
- `dld.config.yaml` must NOT already exist at the repo root (if it does, tell the user DLD is already initialized and suggest `/dld-status` instead)

## Steps

### 1. Ask about project structure

Ask the user:

> Is this a **flat** project (all decisions in one directory) or a **namespaced** project (decisions organized by component/domain, e.g., for a monorepo)?

- **Flat** is the default and right for most projects
- **Namespaced** is for monorepos or projects with distinct domains (billing, auth, etc.)

If namespaced, ask for the initial namespace list. Suggest they can add more later.

### 2. Create `dld.config.yaml`

Run the create-config script:
```bash
bash .claude/skills/dld-init/scripts/create-config.sh <mode> [namespace1 namespace2 ...]
```

Example flat:
```bash
bash .claude/skills/dld-init/scripts/create-config.sh flat
```

Example namespaced:
```bash
bash .claude/skills/dld-init/scripts/create-config.sh namespaced billing auth shared
```

### 3. Create directory structure

```bash
bash .claude/skills/dld-init/scripts/create-directories.sh
```

This reads mode and namespaces from `dld.config.yaml` (created in step 2).

### 4. Create initial INDEX.md

```bash
bash .claude/skills/dld-init/scripts/create-empty-index.sh
```

This reads mode from `dld.config.yaml`.

### 5. Offer to create a practices manifest

Ask the user:

> Would you like to create a **development practices manifest**? This is an optional document (`decisions/PRACTICES.md`) that captures your project's development conventions (testing approach, code style, error handling patterns, etc.). The AI agent reads this when making and implementing decisions.
>
> You can skip this now and add it later at any time.

If they accept, help them fill it out by asking about:
- Testing practices (TDD? coverage targets? integration test requirements?)
- Code style preferences (error handling patterns, validation approach)
- Architecture conventions (dependency injection, repository pattern, etc.)

Write `decisions/PRACTICES.md` with their answers in simple markdown format:
```markdown
# Development Practices

## Testing
- ...

## Code Style
- ...

## Architecture
- ...
```

For namespaced projects, this is the root-level shared practices. Mention they can create namespace-specific practices later at `decisions/<namespace>/PRACTICES.md`.

### 6. Add DLD instructions to `CLAUDE.md`

Append the following block to `CLAUDE.md` at the repo root (create the file if it doesn't exist). If the file exists, add the block at the end, preserving existing content.

```markdown

## DLD (Decision-Linked Development)

This project uses Decision-Linked Development. Decisions are recorded in `decisions/` as individual markdown files.

- When you encounter `@decision(DL-XXX)` annotations in code, use `/dld-lookup DL-XXX` to read the referenced decision BEFORE modifying the annotated code. Understand the rationale behind the decision.
- Use `/dld-decide` to record new decisions
- Use `/dld-implement` to implement proposed decisions
- Use `/dld-lookup` to query decisions by ID, tag, or code path
```

### 7. Suggest next steps

Tell the user:

> DLD is initialized. Here's what you can do next:
> - `/dld-decide` — record your first decision
> - Edit `decisions/PRACTICES.md` to refine your development practices (if created)
