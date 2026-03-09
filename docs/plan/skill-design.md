# DLD Skill Design Plan

## Overview

DLD is implemented as a set of Claude Code skills. All user interaction happens through skills — scripts and utilities are support infrastructure only.

Skills are markdown files with YAML frontmatter in `.claude/skills/`, following the established pattern used by OpenSpec, Spec Kit, and IIC Kit.

---

## Skill Set

### Setup

#### `/dld-init`

Bootstraps DLD in a repository. Interactive. Run once per project.

- Asks whether the project is flat or namespaced
- If namespaced, asks for the initial namespace list
- Creates `dld.config.yaml` at the repo root
- Creates the `decisions/` directory (and namespace subdirectories if applicable)
- Optionally creates a development practices manifest (see below) — suggested but skippable
- Adds DLD agent instructions to `CLAUDE.md`:
  - Instruction to use `/dld-lookup` when encountering `@decision(DL-XXX)` annotations before modifying annotated code
  - Brief description of the DLD workflow

### Core Workflow

#### `/dld-decide`

The primary skill. Records a single decision in one conversation.

- Collects context from the developer (what, why, what it affects)
- Checks for related existing decisions by code references, tags, and keywords
- Asks clarifying questions if needed to articulate rationale (max 3-5, not an interrogation)
- Assigns the next sequential ID (derived by scanning existing files)
- Creates the decision record file in the appropriate directory
- Sets status to `proposed`
- Regenerates `INDEX.md`
- Reads the practices manifest (if it exists) for awareness of project conventions
- Suggests next step: implement the decision or record another

#### `/dld-plan`

For larger features that need multiple decisions.

- Takes a feature description from the developer
- Helps break it down into discrete decisions
- Assigns a shared tag for grouping
- Creates multiple decision records in sequence, each with its own rationale
- All created as `proposed`
- Reads the practices manifest for awareness of project conventions
- Regenerates `INDEX.md`
- Suggests next step: implement decisions in order

#### `/dld-implement`

Takes one or more `proposed` decisions and implements them.

- Reads the referenced decision(s)
- Reads the practices manifest — this is where manifest guidance is most directly applied (testing practices, code style, error handling conventions, etc.)
- Makes the code changes
- Adds `@decision(DL-XXX)` annotations to affected code
- Updates the decision's `references` field with actual code locations
- Flips status from `proposed` to `accepted`
- Regenerates `INDEX.md`
- Suggests next step: record another decision, or run audit

### Maintenance

#### `/dld-audit`

Scans for drift between decisions and code.

- Finds `@decision` annotations in code, checks they reference valid, accepted decisions
- Finds code changes to annotated methods/classes that weren't accompanied by decision updates (compares against last audit commit)
- Identifies decisions whose referenced code no longer exists
- Reports findings, suggests remediation
- Records audit metadata (see "Run Tracking" below)

#### `/dld-snapshot`

Generates two spec projections from the decision log:

1. **`decisions/SNAPSHOT.md`** — Detailed per-decision reference. Every active decision with its rationale summary and code references. Organized by namespace (namespaced) or tag (flat).
2. **`decisions/OVERVIEW.md`** — High-level narrative synthesis. Prose document that explains the system's current design by synthesizing across decisions. Includes Mermaid diagrams for architecture, flows, and decision relationships.

- Reads all `accepted` decisions (excludes superseded/deprecated/proposed)
- Resolves supersession chains
- Generates SNAPSHOT.md first (structured reference), then OVERVIEW.md (narrative synthesis from the snapshot)
- Records snapshot metadata (see "Run Tracking" below)

### Utility

#### `/dld-status`

Quick overview of the decision log state.

- Total decisions by status (proposed, accepted, deprecated, superseded)
- Recent decisions
- Decisions grouped by tag or namespace
- Last audit time and any unresolved drift warnings
- Last snapshot generation time

#### `/dld-lookup`

Look up specific decisions. Primary use case: the AI agent encounters `@decision(DL-XXX)` in code and needs to read the referenced decision before modifying annotated code. Also usable by the developer to query by ID, tag, code path, or keyword.

- By ID: `/dld-lookup DL-047`
- By tag: `/dld-lookup tag:payment-gateway`
- By code path: `/dld-lookup path:src/billing/vat.ts`
- Returns the full decision record(s)

---

## Run Tracking

The audit and snapshot skills need to know what happened since their last run to focus their work effectively.

A `decisions/.dld-state.yaml` file tracks this:

```yaml
audit:
  last_run: 2026-03-07T14:30:00Z
  commit_hash: a1b2c3d4e5f6     # the commit at which the last audit ran
snapshot:
  last_run: 2026-03-05T10:00:00Z
  decisions_included: 47         # highest DL-ID included in last snapshot
```

- **Audit** uses `commit_hash` to diff only changes since the last audit (`git diff <hash>..HEAD` on annotated files)
- **Snapshot** uses `decisions_included` (or `last_run` timestamp) to identify new/changed decisions since the last generation, then regenerates the full snapshot incorporating updates

This file is managed automatically by the skills, never edited manually.

---

## Development Practices Manifest

A lightweight document that captures guiding development principles for the project. Inspired by IIC Kit's constitution concept but intentionally lighter — it's a practices guide, not a governance framework.

### Purpose

Provides the AI agent with project-specific development conventions when making decisions and implementing code. Examples:
- "Always use test-driven development"
- "Minimum 80% test coverage for new code"
- "Use dependency injection, avoid static singletons"
- "All API endpoints must validate input with Zod schemas"
- "Follow the existing error handling pattern using Result types"

### Location

- **Flat projects**: `decisions/PRACTICES.md`
- **Namespaced projects**: `decisions/PRACTICES.md` for shared practices, plus optional `decisions/records/<namespace>/PRACTICES.md` for namespace-specific practices

Namespace-level practices extend (not replace) the root-level practices. If both exist, skills read both, with namespace-specific practices taking precedence on conflicts.

### Format

Simple markdown — no rigid schema. The manifest is meant to be read by the AI agent as context, not parsed programmatically.

```markdown
# Development Practices

## Testing
- Use test-driven development for all new features
- Minimum 80% test coverage for new code
- Integration tests required for all API endpoints

## Code Style
- Use Result types for error handling, avoid throwing exceptions
- All API input validated with Zod schemas
- Prefer composition over inheritance

## Architecture
- All external service calls go through adapter interfaces
- Database access only through repository pattern
```

### How Skills Use It

| Skill | How it uses the manifest |
|-------|-------------------------|
| `/dld-decide` | Awareness — may reference relevant practices when helping structure the decision |
| `/dld-plan` | Awareness — considers practices when breaking down a feature into decisions |
| `/dld-implement` | **Primary consumer** — applies practices directly when writing code (testing approach, patterns, conventions) |
| `/dld-audit` | Could flag implementations that appear to violate stated practices |

### Creation

`/dld-init` suggests creating a practices manifest during setup. The developer can:
- Accept and fill it in (skill helps with structured questions about their practices)
- Skip it entirely (can be added later at any time)

---

## Skill Interaction Flow

```
/dld-init (once)
    │
    ├── /dld-decide ←──────────────────┐
    │       │                          │
    │       ▼                          │
    │   /dld-implement ────────────────┘
    │       │                (record more decisions)
    │       ▼
    │   /dld-audit (periodic)
    │       │
    │       ▼
    │   /dld-snapshot (periodic)
    │
    └── /dld-plan ──→ creates multiple decisions
            │         via /dld-decide logic
            ▼
        /dld-implement (for each)

Utility (anytime):
    /dld-status — overview of decision log state
    /dld-lookup — query specific decisions (also used automatically
                  by the agent when encountering @decision annotations)
```

---

## File Structure

### Skills

```
.claude/
  skills/
    dld-common/scripts/          # Shared utilities
      common.sh
      next-id.sh
      regenerate-index.sh
      update-status.sh
    dld-init/
      SKILL.md
      scripts/
        create-config.sh
        create-directories.sh
        create-empty-index.sh
    dld-decide/
      SKILL.md
      scripts/
        create-decision.sh
    dld-implement/
      SKILL.md
      scripts/
        update-references.sh
    dld-lookup/
      SKILL.md
    dld-plan/                    # V2
      SKILL.md
    dld-status/                  # V2
      SKILL.md
    dld-audit/                   # V2
      SKILL.md
      scripts/
        find-annotations.sh
        update-audit-state.sh
    dld-snapshot/                # V3
      SKILL.md
      scripts/
        collect-active-decisions.sh
        update-snapshot-state.sh
    dld-audit-auto/
      SKILL.md
    dld-retrofit/
      SKILL.md
```

### Project Artifacts (created by skills)

```
dld.config.yaml                     # project configuration
decisions/
  INDEX.md                          # auto-generated decision index
  SNAPSHOT.md                       # detailed per-decision reference
  OVERVIEW.md                       # narrative synthesis with diagrams
  PRACTICES.md                      # development practices manifest (optional)
  .dld-state.yaml                   # run tracking for audit/snapshot
  records/                          # decision records subdirectory
    DL-001.md                       # decision records (flat mode)
    DL-002.md
    billing/                        # namespace directories (namespaced mode)
      PRACTICES.md                  # namespace-specific practices (optional)
      DL-001.md
      DL-004.md
    auth/
      DL-002.md
      DL-005.md
```

---

## Design Principles

1. **Low ceremony** — `/dld-decide` is one conversation, not a pipeline. Developer describes the decision, skill structures it, done.
2. **Prerequisite validation** — Each skill checks that DLD is initialized, that referenced decisions exist, etc. Clear error messages with remediation commands.
3. **Next-step suggestions** — Every skill ends with a suggestion of what to do next.
4. **Context injection** — Skills read `dld.config.yaml` to understand project structure (flat vs namespaced, namespace list, decisions directory).
5. **Manifest awareness** — Core skills read `PRACTICES.md` for project conventions, with `/dld-implement` as the primary consumer.
6. **Index regeneration** — Any skill that creates or modifies decisions regenerates `INDEX.md` automatically.
7. **Run tracking** — Audit and snapshot skills track when they last ran for incremental operation.
8. **CLAUDE.md integration** — `/dld-init` adds instructions so the agent respects `@decision` annotations even outside explicit DLD skill invocations.

---

## Implementation Priority

### V1 (minimum viable)

1. `/dld-init` — without it nothing works
2. `/dld-decide` — the core workflow
3. `/dld-implement` — closes the decision-to-code loop
4. `/dld-lookup` — enables the agent to respect `@decision` annotations

### V2

5. `/dld-plan` — multi-decision feature planning
6. `/dld-status` — quick overview
7. `/dld-audit` — drift detection

### V3

8. `/dld-snapshot` — generated spec projection
