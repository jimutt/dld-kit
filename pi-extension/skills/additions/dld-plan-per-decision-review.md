<!-- DLDKITPI: target=dld-plan, anchor="### 7. Regenerate INDEX.md", position=before -->

**After creating each decision, emit a `review` `dld_signal` for any per-decision choice with a trade-off** — see the top-level "Side-channel signals" section for the full guidance. The per-decision shape:

```
dld_signal({
  kind: "review",
  decisionRef: "DL-NNN",
  title: "<one-line summary of the choice and what was traded off>",
  detail: "<optional, longer explanation>"
})
```

Don't restrict yourself to per-decision emission — earlier planning-time choices (breakdown, tag, sequencing) deserve their own `review` signals at the moment you make them, per the top-level guidance.

