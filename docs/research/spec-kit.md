# GitHub Spec Kit Research

## Overview

GitHub's official SDD framework. Python-based CLI (`specify`) that bootstraps projects with specification-driven templates and automation. Supports 17+ AI agents.

## Key Architecture

- **CLI**: Python (typer/click/rich) — `specify init <project-name> --ai <agent>`
- **Templates**: Master templates for specs, plans, tasks, checklists, constitution
- **Commands**: Markdown files with YAML frontmatter, generated per-agent
- **Scripts**: Dual Bash/PowerShell for cross-platform support
- **Extensions**: Modular hook-based system for custom functionality

## Workflow

8 primary commands:

| Command | Purpose |
|---------|---------|
| `/speckit.constitution` | Define governance principles |
| `/speckit.specify` | Create feature spec (PRD from natural language) |
| `/speckit.clarify` | Resolve ambiguities (max 5 targeted questions) |
| `/speckit.plan` | Technical implementation plan |
| `/speckit.analyze` | Cross-artifact consistency check (read-only) |
| `/speckit.tasks` | Dependency-ordered task list |
| `/speckit.checklist` | Quality validation checklists |
| `/speckit.implement` | Execute all tasks |

Flow: Constitution → Specify → (Clarify) → Plan → (Analyze) → Tasks → Implement

## Spec Format

Feature specs in `specs/[###-feature-name]/spec.md`:
- User stories with priorities (P1/P2/P3), acceptance scenarios (Given/When/Then)
- Functional requirements (FR-001, FR-002) with RFC 2119 keywords
- Success criteria with measurable outcomes
- Intent-driven: focuses on WHAT and WHY, explicitly avoids HOW
- Quality gates: max 3 `[NEEDS CLARIFICATION]` markers

## State Management

- **Feature numbering**: Sequential `001-feature-name`, derived from git branches and `specs/` directory
- **Artifact chain**: spec.md → plan.md + research.md + data-model.md + contracts/ → tasks.md → code
- **Task dependencies**: `[Task_ID]` references, `[P]` parallel markers, phase grouping
- **Context**: `SPECIFY_FEATURE` env var or git branch detection

## Code-to-Spec Linking

No direct code-to-spec annotations. Forward traceability only:
- Plan generates data-model.md and contracts/ (API definitions, schemas)
- Tasks include specific file paths
- Tasks tagged with `[US1]`, `[US2]` linking back to user stories
- Contracts serve as bridge between spec and implementation

## Configuration

- **Project structure**: `.specify/` directory with memory/, scripts/, templates/
- **Agent files**: Generated per `--ai` selection into agent-specific directories
- **Constitution**: `.specify/memory/constitution.md` — governing principles, validated at plan time
- **CLAUDE.md**: Auto-generated with discovered technologies, preserved manual additions

## Extension System

`extension.yml` manifest with:
- Lifecycle hooks: `before_tasks`, `after_tasks`, `before_implement`, `after_implement`
- Namespaced commands: `speckit.extension-id.command-name`
- Version requirements for framework and tools
- Catalog-based discovery

## Key Patterns Relevant to DLD

1. **Constitution as governance** — project principles that gate downstream phases
2. **Multi-phase refinement** — discrete phases with validation gates between them
3. **Structured clarification** — max 5 questions, prioritized by Impact × Uncertainty
4. **Agent abstraction layer** — single command definition maps to 17+ agent formats
5. **Dual-language scripts** — Bash + PowerShell parity for cross-platform
6. **Feature branching with spec tracking** — numbered branches tied to spec directories
7. **Contract-based code generation** — technology-agnostic interface definitions as bridge
8. **Extension hooks** — lifecycle injection points for custom integrations

## Limitations

- No code-to-spec linking (forward traceability only, specs separate from code)
- Greenfield-optimized workflow (brownfield is acknowledged but not the primary path)
- Spec maintenance burden still exists (specs are mutable documents)
- Heavy upfront ceremony for small changes
