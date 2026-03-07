# OpenSpec Framework Research

## Overview

OpenSpec is a spec-driven development framework (~21,847 lines of TypeScript) supporting 25+ AI coding tools. It uses a delta-based specification approach designed for brownfield development.

## Key Architecture

- **CLI**: Commander.js-based with hierarchical commands
- **Two-tier command system**: Skills (long-form agentic guidance in `.claude/skills/`) and slash commands (short inline prompts in `.claude/commands/`)
- **Tool adapter registry**: Generates tool-specific skill/command files for 25+ AI tools via adapter pattern
- **File system as state store**: No database — directory structure encodes all state

## Workflow

Two profiles available:

**Core (default, 4 workflows):**
```
/opsx:propose → /opsx:apply → /opsx:archive
```

**Expanded (11 workflows):**
```
/opsx:new → /opsx:continue or /opsx:ff → /opsx:apply → /opsx:verify → /opsx:sync → /opsx:archive
```

Plus `/opsx:explore` (investigate without creating artifacts) and `/opsx:onboard`.

## Spec Format

Specs live in `openspec/specs/<domain>/spec.md` with requirements in Given/When/Then format using RFC 2119 keywords (MUST, SHALL, SHOULD, MAY).

**Delta specs** describe changes relative to current specs using ADDED/MODIFIED/REMOVED/RENAMED sections. This is the brownfield-first innovation.

## Change Model

Each change is a folder:
```
openspec/changes/<name>/
├── .openspec.yaml      # Metadata
├── proposal.md         # Why
├── design.md           # How
├── tasks.md            # Implementation checklist
└── specs/              # Delta specs
    └── <domain>/spec.md
```

**Archive workflow**: When complete, deltas merge into main specs. Archived changes preserved with date prefix for audit trail.

## Configuration

Two levels:
- **Global** (`~/.config/openspec/config.json`): profile, delivery mode, feature flags
- **Project** (`openspec/config.yaml`): schema, context (tech stack injected into all prompts), per-artifact rules

## Schema-Driven Workflows

Artifact dependencies defined declaratively in YAML:
```yaml
artifacts:
  - id: proposal
    requires: []
  - id: specs
    requires: [proposal]
  - id: design
    requires: [proposal]
  - id: tasks
    requires: [specs, design]
```

Skills respect this dependency graph. Status command shows what's blocked vs ready.

## Skill Generation

Skills are generated programmatically via `generateSkillContent()`:
- Template system with context injection from project config
- Per-artifact rules from config
- Version-stamped for update tracking

## Validation

Layered: Zod schema validation → custom rules → content validation → context validation. Errors collected and reported together, warnings don't block.

## Key Patterns Relevant to DLD

1. **Delta-first specification** — changes described relative to current state, not restating everything
2. **Schema-driven artifact dependencies** — declarative, not hardcoded
3. **Tool adapter pattern** — separate tool-agnostic logic from tool-specific formatting
4. **Change-as-folder packaging** — isolates parallel work, preserves audit trail
5. **Project context injection** — tech stack and rules injected into all AI instructions
6. **File system as database** — git-friendly, inspectable, no setup overhead
7. **Profile system** — core vs expanded workflow sets based on user sophistication

## Limitations

- No direct code-to-spec linking (specs in separate directory, AI must infer relevance)
- Parallel delta merging has known issues (replace-only semantics lose scenarios)
- Manual archive step to consolidate specs
