<!-- DLDKITPI: target=dld-implement, anchor="## Script Paths", position=before -->

## Side-channel signals (continuous through this run)

If the `dld_signal` tool is available, use it **throughout this run** — not just at one step — to keep the human supervisor informed via the side panel. They are watching it instead of reading every thinking line, and rely on signals to know what's happening and what's worth a closer look.

**Five kinds you'll use here:**

- `kind: "progress"` — brief milestones so the human sees where you are. Emit at each phase transition: starting context read, code changes in progress (one per file or batch is fine), tests running, review subagent spawned, push complete. Title only is fine.

- `kind: "review"` — implementation-time choices with a trade-off the human might want to glance at: a specific value picked when the decision left it open, an alternative approach considered, a non-obvious refactor you made along the way.

- `kind: "amend-needed"` — an *existing accepted* decision's rationale or specifics turn out to be stale. Emit and continue with your best working assumption (see step 2).

- `kind: "review-skipped"` — each finding from the review subagent you decide not to fix (see step 6).

- `kind: "blocked"` — you genuinely cannot proceed. Emit AND stop calling tools (see step 2).

**Asymmetry:** cost of an unneeded signal is low (human ignores it); cost of not emitting is high (human can't see what wasn't shared). Lean toward emitting. An implementation run with multiple steps that emits zero signals has almost certainly under-shared.

If `dld_signal` isn't available (non-Pi environment), skip silently — no error.

