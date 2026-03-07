# Research Synthesis: SDD Framework Patterns for DLD

*Analysis of OpenSpec, GitHub Spec Kit, and IIC Kit — March 2026*

---

## Common Patterns Across All Three

- Markdown-based artifacts with structured templates
- Multi-phase workflows exposed as Claude Code skills/commands
- File system as state store (no database)
- Multi-agent support (varying approaches)
- Quality validation between phases
- Skills structured as YAML frontmatter + markdown instruction files in `.claude/skills/`

## Patterns to Adopt

### From OpenSpec

- **Project context injection** — Tech stack and rules from config injected into skill prompts. Simple and high-value. DLD should inject project context (from `dld.config.yaml`) into skill instructions so the AI agent understands the project setup.
- **Profile system** — Core vs expanded workflows. DLD could have a lightweight mode for single decisions and a fuller mode for feature planning across multiple decisions.

### From Spec Kit

- **Structured clarification** — Max 5 questions, prioritized by impact × uncertainty. Useful when the `/dld-decide` skill needs to help the developer articulate the rationale for a decision.
- **Extension hooks** — Lifecycle injection points for custom integrations. Not needed for v1, but the architecture should not preclude adding them later.

### From IIC Kit

- **Skills-first architecture** — All user interaction through skills, scripts are just support infrastructure. This is the clearest model for DLD.
- **Prerequisite validation** — Every skill checks its own prerequisites and provides clear remediation commands. Prevents confusing failures.
- **Next-step suggestion** — After each skill completes, suggest what to do next. Low effort, high UX value.
- **Semantic diff on re-run** — When a decision is being superseded, show what's actually changing rather than a raw text diff.

## Patterns to Avoid

- **Heavy phase ceremony** — All three have 5-8+ mandatory/optional phases. DLD should be lighter. A single decision should be recordable in one skill invocation, not a multi-step pipeline.
- **Constitution/governance layer** — Overkill for DLD's scope. The decision log itself is the governance mechanism.
- **Dual bash/powershell scripts** — Unnecessary complexity for v1. Skills can invoke simple shell commands directly.
- **Spec-as-primary-artifact** — All three treat the spec as the center of the workflow. DLD explicitly inverts this: individual decisions are primary, the spec is a derived projection.
- **Given/When/Then in decisions** — BDD-style scenarios are useful for specs but wrong for decision records, which capture rationale and context, not testable behavior.

## Structural Insight

All three frameworks use the same skill file format: a markdown file with YAML frontmatter in `.claude/skills/<skill-name>/SKILL.md` (IIC Kit) or `.claude/skills/<skill-name>.md` (OpenSpec, Spec Kit). The skill file IS the prompt — it tells the AI agent what to do, what to check, and how to structure its output. This is the established pattern DLD should follow.
