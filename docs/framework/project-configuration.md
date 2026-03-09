# Project Configuration

## Config File

DLD is configured per-project via a `dld.config.yaml` file at the repository root. This file is created by the `/dld-init` skill and defines the project's DLD setup.

### Schema

```yaml
# dld.config.yaml

# Where decision records are stored, relative to repo root
decisions_dir: decisions

# Project structure mode
# - flat: all decisions in a single directory
# - namespaced: decisions organized in subdirectories per component/domain
mode: flat

# Namespaces (only used when mode is "namespaced")
# Each namespace maps to a subdirectory under decisions_dir/records/
namespaces:
  - billing
  - auth
  - shared

# Decision annotation pattern used in code comments
# Default: @decision(DL-XXX)
annotation_prefix: "@decision"
```

### Minimal Config (flat project)

```yaml
decisions_dir: decisions
mode: flat
```

### Monorepo Config

```yaml
decisions_dir: decisions
mode: namespaced
namespaces:
  - billing
  - auth
  - api-gateway
  - shared
```

### ID Assignment

The next available ID is derived by scanning existing decision files rather than tracked in config. This avoids merge conflicts when multiple people create decisions concurrently. The framework scans all `DL-NNN.md` filenames in the `records/` subdirectory (including namespace subdirectories), finds the highest existing ID, and increments by one.

## The `/dld-init` Skill

The `/dld-init` skill bootstraps DLD in a repository:

1. Asks whether the project is flat or namespaced
2. If namespaced, asks for the initial namespace list
3. Creates `dld.config.yaml` at the repo root
4. Creates the `decisions/` directory with a `records/` subdirectory (and namespace subdirectories under `records/` if applicable)
5. Adds DLD instructions to `CLAUDE.md` — specifically, the instruction for the AI agent to look up `@decision` references before modifying annotated code

## Decision Log Index

A `decisions/INDEX.md` file is generated (not manually maintained) and provides a quick overview of all decisions:

```markdown
# Decision Log

| ID | Title | Status | Namespace | Tags |
|----|-------|--------|-----------|------|
| DL-012 | Customer-specific VAT rounding for EU trade | accepted | billing | vat, eu-compliance |
| DL-011 | Rate limiting strategy | accepted | api-gateway | |
| ...  | ... | ... | ... | ... |
```

This index can be regenerated deterministically from the decision files at any time. It is regenerated automatically whenever a decision is created or updated.
