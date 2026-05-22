# Harness-aware skill additions

The signal panel in `dld-kit-pi` only fires if the agent calls the `dld_signal` tool during `/dld-plan` and `/dld-implement` runs. The agent will do that reliably only when the relevant skill files tell it to.

Rather than maintain a third full copy of the `dld-plan` and `dld-implement` skills alongside `dld-kit`'s standard `skills/` (Tessl) and `.claude/skills/` (Claude Code), this directory ships **delta files** — only the harness-aware additions — and an `apply.sh` script that splices them into an existing project's `.claude/skills/` directory.

The standard `dld-plan` and `dld-implement` skills work unchanged without these additions; the agent just won't emit signals.

## Use

```bash
# Apply additions to a project's skills (idempotent — re-runs replace fenced blocks in place):
bash apply.sh /path/to/your-project/.claude/skills

# Preview what would change without writing:
bash apply.sh --dry-run /path/to/your-project/.claude/skills

# Remove all additions, restoring the original file exactly:
bash apply.sh --remove /path/to/your-project/.claude/skills
```

The script edits the project's `dld-plan/SKILL.md` and `dld-implement/SKILL.md` in place. Each addition is wrapped in HTML-comment fences so re-runs replace the block instead of duplicating, and `--remove` cleanly strips them. Apply → remove is a byte-exact round trip against the standard `dld-kit` skill files.

## What gets added

Six insertions across two files. All six are about emitting `dld_signal` calls at the right moments:

| Addition | Target skill | What it adds |
|---|---|---|
| `dld-plan-side-channel-intro` | `dld-plan` | Top-of-skill "Side-channel signals (continuous through this run)" section describing `progress` and `review` signal kinds, when to emit them at each planning phase, and the bias-toward-emitting framing |
| `dld-plan-per-decision-review` | `dld-plan` | Reminder in step 6 to emit a `review` signal for any per-decision choice with a trade-off |
| `dld-implement-side-channel-intro` | `dld-implement` | Top-of-skill counterpart: `progress`, `review`, `amend-needed`, `review-skipped`, `blocked` kinds with per-phase usage |
| `dld-implement-amend-needed` | `dld-implement` | Step 2 block: how to surface plan-vs-reality mismatches on existing accepted decisions |
| `dld-implement-blocked` | `dld-implement` | Step 2 block: how to halt cleanly on a real impasse (emit + stop calling tools) |
| `dld-implement-review-skipped` | `dld-implement` | Step 6 block: emit a signal for each review finding the agent decides not to fix, giving the human an audit trail |

## Anatomy of an addition file

Each file in `additions/` starts with a single-line HTML-comment directive declaring its target skill, anchor heading, and insert position. The rest of the file is the body that gets inserted (verbatim).

```markdown
<!-- DLDKITPI: target=dld-plan, anchor="## Script Paths", position=before -->

## Side-channel signals (continuous through this run)

If the `dld_signal` tool is available, use it **throughout this run** — ...
```

After applying, the target SKILL.md contains the body wrapped in fences using the addition's filename as the fence id:

```markdown
<!-- BEGIN: dld-kit-pi:dld-plan-side-channel-intro -->
## Side-channel signals (continuous through this run)

...

<!-- END: dld-kit-pi:dld-plan-side-channel-intro -->

## Script Paths
```

## When the agent runs against a project without the additions

The extension still loads, the panel still mounts, and the `dld_signal` tool is still registered — but the agent won't proactively emit signals because nothing in its skill instructions tells it to. It will still respond if you explicitly ask it to emit a signal, or if you steer it mid-run.

For the supervision-panel workflow to work end-to-end on a project, the additions need to be in place.

## Reverting cleanly

```bash
bash apply.sh --remove /path/to/your-project/.claude/skills
```

This strips all six fenced blocks plus the padding blank line each one adds. The resulting files are byte-identical to the pre-apply state.
