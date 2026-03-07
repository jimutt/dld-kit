# Intent Integrity Chain (IIC) Kit Research

## Overview

A comprehensive SDD framework emphasizing cryptographic assertion integrity and strict phase separation. Distributed via Tessl tile registry. Built as a suite of Claude Code skills with multi-agent support via symlinks.

## Key Architecture

- **Skills-first**: All user interaction through Claude Code skills (`/iikit-XX-skillname`), scripts are support infrastructure
- **Multi-agent**: Primary in `.claude/skills/`, symlinked to `.codex/skills/`, `.gemini/skills/`, `.opencode/skills/`
- **Cross-platform**: Every script has identical Bash and PowerShell implementations (non-negotiable principle)
- **Phase separation**: Strict boundaries between governance, requirements, design, implementation

## Workflow

8 sequential phases + 3 utilities:

| Phase | Command | Purpose |
|-------|---------|---------|
| Utility | `/iikit-core` | Init, status, select feature, help |
| Utility | `/iikit-clarify` | Resolve ambiguities (any phase) |
| Utility | `/iikit-bugfix` | Bug fixes without full workflow |
| 0 | `/iikit-00-constitution` | Define governance principles |
| 1 | `/iikit-01-specify` | Create feature spec |
| 2 | `/iikit-02-plan` | Technical design |
| 3 | `/iikit-03-checklist` | Quality checklists (optional) |
| 4 | `/iikit-04-testify` | Generate Gherkin .feature files |
| 5 | `/iikit-05-tasks` | Dependency-ordered task list |
| 6 | `/iikit-06-analyze` | Cross-artifact consistency check |
| 7 | `/iikit-07-implement` | Execute with integrity verification |

Mandatory flow: 00 → 01 → 02 → 05 → 07. Optional branches: 03, 04, 06.

## Skill Structure

Each skill is a directory with `SKILL.md`:
```
.claude/skills/iikit-XX-skillname/
  SKILL.md              # YAML frontmatter + markdown instructions
  templates/            # Optional
  references/           # Optional
  scripts/
    bash/
    powershell/
```

Every skill follows: Input → Constitution load → Prerequisites check → Feature selection → Quality gates → Execution → Validation → Commit → Dashboard refresh → Next steps.

## Spec Format

Similar to Spec Kit: feature specs in `specs/NNN-feature/spec.md` with user stories (prioritized, independently testable), functional requirements (FR-XXX), acceptance scenarios (Given/When/Then), success criteria.

## State Management

- **Context JSON** (`.specify/context.json`): Active feature, TDD determination, assertion hashes, eval scores
- **Per-feature state**: `specs/NNN/context.json` with hashes and timestamps
- **Feature stages**: specified → planned → testified → tasks-ready → implementing-NN% → complete
- **Next-step engine**: `next-step.sh --json` returns next mandatory step, alternatives, and model tier recommendations

## Assertion Integrity (Unique Feature)

Prevents AI from modifying tests to match buggy code:
1. Testify generates .feature files, computes SHA-256 hash of all assertion lines
2. Hash stored in context.json + git notes (tamper-resistant backup)
3. Pre-commit hook blocks commits if .feature files modified without re-running testify
4. Implement phase enforces RED-GREEN cycle: tests must fail before code, pass after

## Code-to-Spec Linking

Bi-directional traceability via Gherkin tags:
```gherkin
@TS-001 @FR-005 @US-001 @SC-003 @P1 @acceptance
Scenario: User can add a task
```

Tags: `@TS-XXX` (test spec), `@FR-XXX` (requirement), `@US-XXX` (user story), `@SC-XXX` (success criteria), `@P1/P2/P3` (priority).

Cross-artifact analysis checks coverage completeness.

## Configuration

- **Constitution**: `CONSTITUTION.md` at project root — minimum 3 principles, validated on every phase
- **Premise**: `PREMISE.md` — what, who, why, domain, scope
- **Context**: `.specify/context.json` — runtime state
- **Framework principles**: `FRAMEWORK-PRINCIPLES.md` — IIKit's own governance

## Key Patterns Relevant to DLD

1. **Skills-first architecture** — all user interaction via skills, scripts are implementation details
2. **Prerequisite validation pattern** — every skill checks its own prerequisites, returns JSON with clear remediation
3. **Semantic diff on re-run** — detects what changed semantically, warns about downstream impact
4. **Next-step engine** — JSON-based state machine suggesting next action + model tier recommendation
5. **Phase separation enforcement** — auto-fixes content that leaks between phases (tech in constitution, governance in plan)
6. **Dashboard as live artifact** — static HTML auto-regenerated after each phase, no server needed
7. **Context JSON for state** — lightweight state tracking between skill invocations
8. **Assertion integrity chains** — cryptographic hashing to prevent test tampering (novel approach)
9. **Model tier recommendations** — suggests which Claude model (base/standard/advanced) for each phase

## Limitations

- Heavy ceremony — 8 phases is a lot, even with optional ones
- Tightly coupled to Tessl distribution system
- Constitution requirement may be overkill for small projects
- Complex script infrastructure (dual bash/powershell for every operation)
