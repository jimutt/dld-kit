<!-- DLDKITPI: target=dld-implement, anchor="### 3. Add `@decision` annotations", position=before -->

**If you genuinely cannot proceed (`blocked` halt):** If you hit a real fork in the road that needs human judgment to resolve (two valid implementations with different trade-offs, missing context the decision didn't anticipate), emit a blocking signal *and then stop calling tools*:

```
dld_signal({
  kind: "blocked",
  decisionRef: "DL-NNN",
  title: "<one-line question>",
  detail: "<context: what you tried, what the choice is, why you can't decide>",
  suggestedAction: "Pick A or B in panel, or type in chat"
})
```

Then end your turn. Do not attempt further tool calls. Wait for the human to respond — their answer will be in context on your next turn. Reserve `blocked` for genuine impasses; for soft preferences use `review` or `question` instead and continue with a defensible default.

