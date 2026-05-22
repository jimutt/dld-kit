<!-- DLDKITPI: target=dld-implement, anchor="If you made fixes, re-run the verification script from step 5 to ensure annotations are still intact.", position=before -->

**Surfacing skipped findings via `dld_signal` (if available):** For each finding from the review subagent that you DECIDE NOT TO FIX (cosmetic, subjective, out-of-scope, low-value-for-cost), emit a signal so the human supervisor has a clean audit trail of judgment calls you made unilaterally:

```
dld_signal({
  kind: "review-skipped",
  title: "<the reviewer's suggestion in one line>",
  detail: "<why you skipped — cost, scope, subjectivity, etc.>"
})
```

The human can later override your decision by responding to the signal in the panel. Findings you DO fix don't need a signal — the diff speaks for itself. If `dld_signal` isn't available, fall back to mentioning skipped findings in your final summary text.

