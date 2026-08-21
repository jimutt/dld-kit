# Decision Log

| ID | Title | Status | Tags |
|----|-------|--------|------|
| DL-011 | Run visibility is layered: status line, fixed-height widget, transcript cards, board overlay | proposed | dld-goal, extension, ui |
| DL-010 | Compaction during a run is assembled deterministically from disk, never model-summarised | proposed | dld-goal, extension, context |
| DL-009 | Child-session rotation is a re-entrant controller driven by a typed tool, verified against disk | proposed | dld-goal, extension, architecture |
| DL-008 | In-session continuation fires on agent_end behind idle, token, and bounds gates | proposed | dld-goal, extension, execution |
| DL-007 | The extension reads run state directly but delegates every mutation to the skill scripts | proposed | dld-goal, architecture, state |
| DL-006 | dld-kit is a Pi package: TypeScript extension, no build step, bun test | proposed | dld-goal, packaging, tooling |
| DL-005 | The skill owns DLD semantics; a Pi extension owns loop mechanics | accepted | dld-goal, architecture |
| DL-004 | Runs halt on unsafe preconditions and escalate blocked items as operator questions in the run | accepted | dld-goal, safety, execution |
| DL-003 | Item completion is a four-part transaction, never a model claim | accepted | dld-goal, verification |
| DL-002 | A work item is one or more coupled decisions, pinned by content hash | accepted | dld-goal, execution |
| DL-001 | Goal run state lives in gitignored .dld/runs/ as JSON plus an append-only event log | accepted | dld-goal, state, tooling |
