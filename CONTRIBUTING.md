# Contributing

```bash
bun install                               # dev dependencies (Bun is a dev tool; the CLI runs on Node 20+)
npm run lint && npm run typecheck && npm test
```

Skills and plugin manifests are generated: edit `templates/`, then run `npm run generate` to rebuild `skills/`, `.claude/skills/`, `claude-plugin/` and the manifests. See `CLAUDE.md` for the full set of commands, `docs/releasing.md` for releases, and `docs/plan/v1.md` for the 1.0 plan.
