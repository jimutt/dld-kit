# Installing DLD Kit

The [README](../README.md#install) says which channel to use. This page has the details for each channel, how channels combine, and where each agent gets the always-on rule.

Requirements: Node.js 20+ and git. `gh` is optional; `/dld-reindex` uses it to check open PRs.

Each channel below installs the same skills. They differ in which agents they reach, how the always-on rule gets into the agent's context, and how you update.

| Channel | Agents | Installs into | Always-on rule | Update with |
|---|---|---|---|---|
| [`npx dld-kit init`](#npx-dld-kit-init) | Claude Code, Antigravity, Codex, Cursor, OpenCode, Pi | The project, committed | Written by `init` | `npx dld-kit@latest update` |
| [Claude Code plugin](#claude-code-plugin) | Claude Code | Your user profile | SessionStart hook | `claude plugin marketplace update dld-kit`, then `claude plugin update dld@dld-kit` |
| [Codex and Copilot CLI plugins](#codex-and-copilot-cli-plugins) | Codex, Copilot CLI | Your user profile | dld-init skill | Codex's plugin manager; `copilot plugin update` |
| [Pi package](#pi-package) | Pi | Your user profile, or the project with `-l` | dld-init skill | `pi update npm:dld-kit` |
| [`npx skills` / `gh skill`](#npx-skills-or-gh-skill) | Any agent those tools support | The project, or your user profile with `-g` | dld-init skill | `npx skills update` / `gh skill update` |
| [Manual copy](#manual-copy) | Any Agent Skills harness | Wherever you copy them | dld-init skill | Copy again |

## `npx dld-kit init`

Run in the root of a git repository:

```bash
npx dld-kit init
```

This writes:

- `dld.config.yaml`, `decisions/records/` and `decisions/INDEX.md`
- the `dld-*` skills for each selected agent: `.claude/skills/` for Claude Code, `.agents/skills/` for the others
- the always-on rule, once per agent: a block between `<!-- dld-kit:start -->` and `<!-- dld-kit:end -->` in `AGENTS.md` (or `CLAUDE.md`) for Codex, Cursor, OpenCode and Pi, `.agents/rules/dld-workflow.md` for Antigravity, and `.claude/rules/dld-workflow.md` for Claude Code unless Claude Code already reads the block (see [Agents](#agents)). When the block goes into `AGENTS.md` and the project has no `CLAUDE.md` or `.claude/CLAUDE.md`, it writes `.claude/CLAUDE.md` instead, which imports `AGENTS.md` for Claude Code

`init` detects the agents from files in the project (`.claude/`, `.codex/`, `.cursor/`, `opencode.json`, `.pi/`, `AGENTS.md` and so on) and asks you to confirm the list. Options:

- `--agent claude,codex`: add agents to the detected ones
- `--namespaces billing,auth`: one decision directory per namespace (for monorepos)
- `--yes`: skip the question and use the detected agents plus `--agent`

Commit the files. Teammates then need nothing installed.

To upgrade, run `npx dld-kit@latest update`. It rewrites the `dld-*` skills and the rule for the agents already installed, and never touches decision records or `dld.config.yaml`. Add `--agent <name>` to install for another agent.

## Claude Code plugin

In Claude Code:

```
/plugin marketplace add jimutt/dld-kit
/plugin install dld@dld-kit
```

Then run `/dld-init` in each project. The plugin's SessionStart hook adds the always-on rule to each session in projects that have `dld.config.yaml` and do not already load the rule. `/dld-init` also installs `.claude/rules/dld-workflow.md`, so teammates without the plugin get the rule too.

Skills run as `/dld-plan`, or as `/dld:dld-plan` if another skill has the same name. Third-party marketplaces do not auto-update by default. To update:

```bash
claude plugin marketplace update dld-kit
claude plugin update dld@dld-kit
```

## Codex and Copilot CLI plugins

Both install the portable skills from the repository root, with no hook.

```bash
codex plugin marketplace add jimutt/dld-kit       # then install dld from /plugins in Codex
copilot plugin marketplace add jimutt/dld-kit
copilot plugin install dld@dld-kit
```

Then run the dld-init skill in each project for the config and the rule. For Copilot CLI it installs the rule as for Codex.

## Pi package

```bash
pi install npm:dld-kit        # for your user
pi install -l npm:dld-kit     # for this project (.pi/settings.json)
```

Run `/skill:dld-init` in each project for the config and the rule. Update with `pi update npm:dld-kit`.

## `npx skills` or `gh skill`

```bash
npx skills add jimutt/dld-kit
gh skill install jimutt/dld-kit --all
```

Install all the skills. If you pick some with `--skill`, include `dld-common`: it holds the `dld` CLI the other skills run. Then run the dld-init skill in each project for the config and the rule. Update with `npx skills update` or `gh skill update`.

`npx skills` puts the files in `.agents/skills/` and links them from `.claude/skills/` for Claude Code. `dld update` refuses to write through those links; keep updating with `npx skills update`.

## Manual copy

Copy the `dld-*` directories from [`skills/`](../skills/) into your agent's skills directory, or from [`.claude/skills/`](../.claude/skills/) into a project's `.claude/skills/` for Claude Code. Include `dld-common`. Then run the dld-init skill for the config and the rule.

## Combining channels

Channels can be combined. These combinations need care:

- **A user-level plugin or package, plus skills committed in the project for the same agent.** The agent sees each skill twice, possibly at different versions. In Claude Code, run the plugin's copy as `/dld:dld-plan`.
- **Skills for Claude Code and for an `.agents/skills/` agent in one project.** OpenCode and Cursor read both `.claude/skills/` and `.agents/skills/`. OpenCode 2.x loads the `.agents/skills/` copy; OpenCode 1.x and Cursor may load either. Both copies work.
- **`dld update` and `npx skills` on the same skills.** `dld update` refuses symlinked skills and warns when `skills-lock.json` lists `dld-*` skills. Update those skills with one tool.

## Agents

| Agent | Skills (`dld init`) | Always-on rule (`dld init`, `/dld-init`) | Run a skill |
|---|---|---|---|
| Claude Code | `.claude/skills/` | `.claude/rules/dld-workflow.md`, or the block in `CLAUDE.md`, or in `AGENTS.md` imported from a CLAUDE file (`@AGENTS.md`) | `/dld-plan` |
| Antigravity | `.agents/skills/` | `.agents/rules/dld-workflow.md` | Ask for the dld-plan skill |
| Codex | `.agents/skills/` | Block in `AGENTS.md` | Ask for the dld-plan skill |
| Cursor | `.agents/skills/` | Block in `AGENTS.md` or `CLAUDE.md` (Cursor reads both) | Ask for the dld-plan skill |
| OpenCode | `.agents/skills/` | Block in `AGENTS.md` (OpenCode 2.x reads no `CLAUDE.md`) | Ask for the dld-plan skill |
| Pi | `.agents/skills/` | Block in `AGENTS.md`, or `CLAUDE.md` if there is no `AGENTS.md` | `/skill:dld-plan` |
| Copilot CLI | Plugin only | Block in `AGENTS.md` (installed as for Codex) | Ask for the dld-plan skill |

A new block goes into `AGENTS.md` if it exists. Otherwise it goes into an existing `CLAUDE.md` only when every selected agent that takes the block (Codex, Cursor, OpenCode, Pi) reads that file, which Cursor and Pi do, and into a new `AGENTS.md` in all other cases. Pi reads `CLAUDE.md` only while there is no `AGENTS.md`, so when `dld` creates `AGENTS.md` next to a `CLAUDE.md` for Pi, it warns you to move anything Pi needs. A block already in `CLAUDE.md` stays there; `dld install-rule` warns about agents that cannot see it (Codex, OpenCode) and says how to move it.

Each agent gets the rule once. Claude Code reads `AGENTS.md` by itself only when the project has no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md`, so adding one of those (even an uncommitted `CLAUDE.local.md`) would stop it. When the block is in `AGENTS.md` and the project has no `CLAUDE.md` or `.claude/CLAUDE.md`, `init` writes `.claude/CLAUDE.md` with the line `@../AGENTS.md`. Claude Code then loads `AGENTS.md` through that import, once, whichever CLAUDE files are added later. If a `CLAUDE.md` of yours already imports `@AGENTS.md`, the block there is Claude Code's rule and no other file is written.

## Manual rule setup

The always-on rule tells the agent to read a decision before changing code annotated with it. `/dld-init` installs it with `dld install-rule --agent <harness>`, which picks the file the harness loads: `.claude/rules/dld-workflow.md` for Claude Code (unless it reads the block in `AGENTS.md`, directly or through a `.claude/CLAUDE.md` import), `.agents/rules/dld-workflow.md` for Antigravity, or a marked block in `AGENTS.md` (or `CLAUDE.md`) for Codex, Cursor, OpenCode and Pi.

To add it by hand instead, copy [`templates/rules/dld-workflow.md`](../templates/rules/dld-workflow.md) into one of those files.
