<!-- DLDKITPI: target=dld-plan, anchor="## Script Paths", position=before -->

## Side-channel signals (continuous through this run)

If the `dld_signal` tool is available, use it **throughout this run** — not just at one step — to keep the human supervisor informed via the side panel. They are watching it instead of reading every thinking line, and rely on signals to know what's happening and what's worth a closer look.

**Two kinds you'll use here:**

- `kind: "progress"` — brief milestones so the human sees where you are. Emit at each phase transition: starting discovery, discovery complete, breakdown ready, starting decision creation, run complete. One line per emit; the panel coalesces these visually. Title only is fine.

- `kind: "review"` — a choice with a non-obvious trade-off the human might want to glance at. Emit at every planning-time choice, not just per-decision. Examples by phase:
  - **Discovery:** finding something that affects scope or approach ("existing DL-NNN already covers part of this")
  - **Breakdown:** 2 decisions vs 3 decisions ("folded X into the rule decision rather than giving it its own record"), what to include vs exclude from scope
  - **Tag/naming:** when more than one reasonable name exists ("chose `dld-comment-policy` over `dld-code-comments`")
  - **Sequencing:** when the ordering of decisions matters ("placed rule before cleanup so cleanup can cite it")
  - **Per-decision** (during creation in step 6): specific numeric constants chosen without external guidance; one of two reasonable structural approaches; tight coupling between two decisions in this batch; naming or API surface choices

**Asymmetry:** cost of an unneeded signal is low (human ignores it); cost of not emitting is high (human can't see what wasn't shared). Lean toward emitting. A planning run with multiple non-trivial choices that emits zero `review` signals has almost certainly under-shared — reconsider before finishing.

If `dld_signal` isn't available (non-Pi environment), skip silently — no error.

