# dld-kit-pi

[Decision-Linked Development](https://github.com/jimutt/dld-kit) as a first-class [Pi](https://pi.dev) extension.

> Experimental. Lives on the `experimental/pi` branch of `dld-kit`; not part of the main release.

## What it does

Three integrations on top of the standard DLD skills:

1. **`@decision(DL-` and `@` autocomplete.** Type `@decision(DL-` in the editor and Pi suggests decision IDs with title previews. Same for `@DL-NNN` references in chat.
2. **Pre-edit guardrail.** When the agent reads a file with `@decision(DL-NNN)` annotations, the relevant decision records are fused into the read result so the agent sees the rationale before editing. Two modes: `surface` (steer message, agent decides) and `strict` (block-with-reason if the decision isn't visibly in the agent's recent context). Toggle with `/dld-strict off|surface|strict`.
3. **Side-channel signal panel.** A `dld_signal` custom tool lets the agent emit structured signals (`progress`, `review`, `amend-needed`, `review-skipped`, `question`, `blocked`) into a framed widget above the editor during long `/dld-plan` and `/dld-implement` runs. Human supervises via the panel instead of reading every line; `opt+r` enters focus-in-place navigation (j/k/↑↓), enter prefills the editor for a response, `x` resolves, `opt+a` marks all as read, `opt+p` hides/shows the panel.

The extension is **silent in non-DLD projects** (no `dld.config.yaml` at the git root → no UI, no tool registration, no shortcuts).

## Quick start

```bash
cd pi-extension
bun install
bun test
bun run check
```

## Running

### Iterate on the extension

```bash
cd ~/dev/dld-kit/pi-extension
pi                                 # .pi/extensions/dld.ts auto-loads
# edit src/features/*.ts, then in pi:
/reload                            # jiti hot-reload picks up changes
```

### Use against another DLD project

```bash
cd ~/dev/dld-kit/pi-extension
bun run install:global             # appends to ~/.pi/agent/settings.json
cd ~/dev/your-dld-project
pi                                 # extension is active
```

Reverse with `bun run uninstall:global`. Requires `jq`.

For the signal panel to fire during `/dld-plan` and `/dld-implement`, also apply the harness-aware skill additions:

```bash
cd ~/dev/your-dld-project
bash ~/dev/dld-kit/pi-extension/skills/apply.sh .claude/skills
```

See [`skills/README.md`](skills/README.md) for what this does and how to revert.

### One-off probe

```bash
pi -e ~/dev/dld-kit/pi-extension/.pi/extensions/dld.ts
```

No settings change. Useful for trying the extension on a third repo without a global install.

## Layout

```
src/
├── index.ts            # extension factory: lifecycle, shared state, shortcuts
├── core/               # Pi-agnostic; unit-testable
│   ├── decision-index.ts
│   ├── signal-store.ts
│   ├── annotations.ts
│   └── render-llm.ts
├── features/           # Pi-bound; one file per feature
│   ├── autocomplete.ts
│   ├── guardrail.ts
│   └── signal-tool.ts
└── ui/                 # TUI components
    ├── decision-card.ts
    └── signal-panel.ts
tests/
├── fixtures/sample-project/   # hand-crafted DL-*.md for unit tests
└── *.test.ts                  # bun:test
skills/                 # harness-aware additions to /dld-plan and /dld-implement
├── README.md
├── additions/          # delta files
└── apply.sh            # idempotent splice into a project's .claude/skills/
.pi/extensions/dld.ts   # one-line re-export so `pi` here auto-discovers
bin/                    # install-global.sh / uninstall-global.sh
```

Pi loads `.ts` directly via jiti. No build step. `bun test` and `bun run check` are the only local validations.

## Configuration

A `dld.config.yaml` at the git root activates the extension. An optional `harness:` block configures harness-specific behavior:

```yaml
project: my-project
mode: flat

# Optional. Read by dld-kit-pi; ignored by portable dld-kit skills.
harness:
  guardrail_mode: surface          # off | surface | strict
```

Unknown keys are ignored by both, so the harness block stays portable.

## Relationship to standard dld-kit

This directory is **additive**. The standard `skills/` and `.claude/skills/` at the repo root are not modified. Harness-aware skill additions live in `pi-extension/skills/additions/` and are opt-in via `apply.sh`. Deleting this directory removes all trace.
