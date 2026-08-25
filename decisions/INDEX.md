# Decision Log

| ID | Title | Status | Tags |
|----|-------|--------|------|
| DL-016 | Add a findings log to the run contract: the agent records what it noticed, surfaced on completion | proposed | dld-goal, extension, run-contract |
| DL-015 | Rename dld-goal to dld-run: the command is a run, not a goal | accepted | dld-goal, naming, ux |
| DL-014 | Amend DL-008: Esc suspends the loop; pause aborts the current turn | accepted | dld-goal, extension, execution |
| DL-013 | Amend DL-008: continuation is a scheduled dispatch, not an awaited handler | accepted | dld-goal, extension, execution |
| DL-012 | Amend DL-007: correct the delegated script list | accepted | dld-goal, architecture, state |
| DL-011 | Run visibility is layered: status line, fixed-height widget, transcript cards, board overlay | accepted | dld-goal, extension, ui |
| DL-010 | Compaction during a run is assembled deterministically from disk, never model-summarised | proposed | dld-goal, extension, context |
| DL-009 | Child-session rotation is a re-entrant controller driven by a typed tool, verified against disk | proposed | dld-goal, extension, architecture |
| DL-008 | In-session continuation fires on agent_end behind idle, token, and bounds gates | accepted | dld-goal, extension, execution |
| DL-007 | The extension reads run state directly but delegates every mutation to the skill scripts | accepted | dld-goal, architecture, state |
| DL-006 | dld-kit is a Pi package: TypeScript extension, no build step, bun test | accepted | dld-goal, packaging, tooling |
| DL-005 | The skill owns DLD semantics; a Pi extension owns loop mechanics | accepted | dld-goal, architecture |
| DL-004 | Runs halt on unsafe preconditions and escalate blocked items as operator questions in the run | accepted | dld-goal, safety, execution |
| DL-003 | Item completion is a four-part transaction, never a model claim | accepted | dld-goal, verification |
| DL-002 | A work item is one or more coupled decisions, pinned by content hash | accepted | dld-goal, execution |
| DL-001 | Goal run state lives in gitignored .dld/runs/ as JSON plus an append-only event log | accepted | dld-goal, state, tooling |
