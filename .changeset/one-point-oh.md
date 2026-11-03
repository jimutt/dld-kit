---
"dld-kit": major
---

dld-kit 1.0.0. Coming from 0.x, follow [Upgrading from 0.x](https://github.com/jimutt/dld-kit/blob/main/docs/upgrading-from-0x.md): your decision records, `dld.config.yaml`, `INDEX.md` and `.dld-state.yaml` carry over unchanged. Coming from a 1.0 release candidate, run `npx dld-kit@latest update` and commit the result. The changes since 0.9.0:

- **Install and update with one command.** `npx dld-kit init` sets DLD up in a repository for Claude Code, Antigravity, Codex, Cursor, OpenCode and Pi, and `npx dld-kit@latest update` upgrades it. DLD is also available as a Claude Code plugin, as Codex and Copilot CLI plugins, as a Pi package, and through `npx skills` and `gh skill`. The Tessl tile gets no new versions.
- **The skills run a bundled Node CLI instead of bash scripts.** dld-kit needs Node.js 22 or newer and git.
- **The always-on rule is installed for each agent,** in the file that agent loads, instead of a section appended to `CLAUDE.md`.
- **Decisions are drafts until they reach the base branch.** After that their prose is protected: `decision_edits` sets how strictly, and `dld check-decision-edits` can enforce it in CI.
- **`/dld-snapshot` generates `OVERVIEW.md`** and the documents you define in `snapshot_artifacts`. It no longer writes `SNAPSHOT.md`, and offers to delete an old one.
- **Reviews are configurable:** `/dld-plan` can review the plan (`plan_review`), `review_model` picks the reviewers' model, and `dld.local.yaml` holds your own review settings, uncommitted.
- **`/dld-reindex` commits the renames on top of your branch** and squashes only when asked, and `INDEX.md` merges with git's union driver.
- **`/dld-audit` reports missing `amends` and `supersedes` links** that a decision's text states, and `annotation_exclude` keeps example annotations in docs out of the audit.
- **From 1.0.0, versions follow semver** for everything a project builds on: the record format, annotations, the config files, the setup and CI commands, the installed layout, skill names and the install channels. See [What a version number promises](https://github.com/jimutt/dld-kit/blob/main/docs/releasing.md#what-a-version-number-promises).
