<!-- DLDKITPI: target=dld-implement, anchor="### 3. Add `@decision` annotations", position=before -->

**Surfacing plan-vs-reality mismatches via `dld_signal` (if available):** If you discover during implementation that an existing decision's rationale or specifics are stale — the code reality differs from what the decision assumed in a way that matters — emit a signal and continue with your best working assumption:

```
dld_signal({
  kind: "amend-needed",
  decisionRef: "DL-NNN",
  title: "<one-line summary of what's stale>",
  detail: "<what should change and why>",
  suggestedAction: "Run /dld-decide to amend DL-NNN before merging"
})
```

This is for *existing* decisions that need revision, not for the proposed decisions you're implementing right now (those you update inline per above). The human picks up the amendment post-run via `/dld-decide`. If the tool isn't available, note the discrepancy in your reply text instead.

