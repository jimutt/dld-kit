#!/usr/bin/env bash
# Sets up the git repo fixture for the dld-reindex collision scenario.
# Run from the workspace root (this script's directory).
set -euo pipefail

echo "=== Setting up dld-reindex collision fixture ==="

git init -b main
git config user.email "test@example.com"
git config user.name "Test User"

# The DLD reindex and common scripts are vendored verbatim from the kit at
# .tessl/skills/ (the tessl install layout) — this fixture must exercise the
# real scripts, not reimplementations of them.

# ── Create initial state on main: DL-001 through DL-003 ─────────────────────
mkdir -p decisions/records decisions

cat > decisions/records/DL-001.md << 'MD'
---
id: DL-001
title: Use PostgreSQL as the primary database
status: accepted
date: 2024-01-10
tags: [infrastructure]
---

## Context
We need a reliable relational database for the project.

## Decision
We will use PostgreSQL 15 as the primary database.

## Consequences
Standard ORM support; strong ACID guarantees.
MD

cat > decisions/records/DL-002.md << 'MD'
---
id: DL-002
title: Use REST over GraphQL for external API
status: accepted
date: 2024-01-12
tags: [api]
---

## Context
External consumers need a stable API surface.

## Decision
We will expose a REST API rather than GraphQL for external clients.

## Consequences
Simpler caching, wider client compatibility.
MD

cat > decisions/records/DL-003.md << 'MD'
---
id: DL-003
title: Adopt hexagonal architecture
status: accepted
date: 2024-01-15
tags: [architecture]
---

## Context
We need clear separation between domain logic and infrastructure.

## Decision
We will structure the codebase using hexagonal (ports and adapters) architecture.

## Consequences
Better testability; adapters can be swapped independently.
MD

cat > decisions/INDEX.md << 'MD'
# Decision Index

| ID | Title | Status |
|----|-------|--------|
| DL-001 | Use PostgreSQL as the primary database | accepted |
| DL-002 | Use REST over GraphQL for external API | accepted |
| DL-003 | Adopt hexagonal architecture | accepted |
MD

cat > dld.config.yaml << 'YAML'
mode: flat
decisions_dir: decisions
YAML

git add .
git commit -m "feat: initial DLD setup with DL-001 through DL-003"

# ── Create feature branch from this point ────────────────────────────────────
git checkout -b feature/add-observability-decisions

cat > decisions/records/DL-004.md << 'MD'
---
id: DL-004
title: Adopt OpenTelemetry for distributed tracing
status: accepted
date: 2024-02-01
tags: [observability]
---

## Context
We need end-to-end tracing across microservices to diagnose latency issues in production.

## Decision
We will adopt OpenTelemetry as the unified tracing and metrics standard, exporting spans to Jaeger.

## Consequences
Vendor-neutral instrumentation across services; adds per-service instrumentation overhead.
MD

git add decisions/records/DL-004.md
git commit -m "feat: add DL-004 for OpenTelemetry tracing strategy"

cat > decisions/records/DL-005.md << 'MD'
---
id: DL-005
title: Use structured JSON logging
status: accepted
date: 2024-02-03
tags: [observability]
---

## Context
Log aggregation pipelines (Loki, Elasticsearch) parse structured logs more reliably than plain text.

## Decision
All services will emit structured JSON logs using the pino library with ISO-8601 timestamps.

## Consequences
Consistent log format across services; slight serialization overhead per log call.
MD

git add decisions/records/DL-005.md
git commit -m "feat: add DL-005 for structured JSON logging"

# ── Back to main: add DL-004 and DL-005 (different decisions — these are the collisions) ──
git checkout main

cat > decisions/records/DL-004.md << 'MD'
---
id: DL-004
title: Use Redis for session storage
status: accepted
date: 2024-01-20
tags: [infrastructure]
---

## Context
HTTP sessions must survive server restarts in a multi-instance deployment.

## Decision
We will use Redis for distributed session storage, keyed by session token.

## Consequences
Sessions persist across deploys; Redis adds an operational dependency to the stack.
MD

cat > decisions/records/DL-005.md << 'MD'
---
id: DL-005
title: Use JWT for service-to-service auth
status: accepted
date: 2024-01-22
tags: [security]
---

## Context
Internal microservices need a lightweight, stateless authentication mechanism.

## Decision
We will use short-lived JWTs signed with RS256 for service-to-service authentication.

## Consequences
Stateless verification at each service; key rotation needed on compromise.
MD

cat > decisions/INDEX.md << 'MD'
# Decision Index

| ID | Title | Status |
|----|-------|--------|
| DL-001 | Use PostgreSQL as the primary database | accepted |
| DL-002 | Use REST over GraphQL for external API | accepted |
| DL-003 | Adopt hexagonal architecture | accepted |
| DL-004 | Use Redis for session storage | accepted |
| DL-005 | Use JWT for service-to-service auth | accepted |
MD

git add decisions/records/DL-004.md decisions/records/DL-005.md decisions/INDEX.md
git commit -m "feat: add DL-004 (Redis sessions) and DL-005 (JWT auth)"

# ── Set up remote and push main ──────────────────────────────────────────────
echo ""
echo "=== Creating remote and pushing main ==="
mkdir -p /tmp/dld-reindex-remote.git
git init --bare /tmp/dld-reindex-remote.git -b main 2>/dev/null || true
git remote add origin /tmp/dld-reindex-remote.git
git push -u origin main

# ── Check out feature branch (agent starts here) ─────────────────────────────
git checkout feature/add-observability-decisions

echo ""
echo "=== Setup complete ==="
echo "Branch: $(git rev-parse --abbrev-ref HEAD)"
echo "Feature branch commits ahead of main:"
git log --oneline origin/main..HEAD 2>/dev/null || git log --oneline main..HEAD
echo ""
echo "Collision: DL-004 and DL-005 exist on both main and feature branch"
echo "  main/DL-004: Redis session storage"
echo "  main/DL-005: JWT service-to-service auth"
echo "  feature/DL-004: OpenTelemetry tracing"
echo "  feature/DL-005: Structured JSON logging"
