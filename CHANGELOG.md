# dld-kit

## 1.0.0

### Major Changes

- 3c5c3e9: dld-kit 1.0.0. Coming from 0.x, follow [Upgrading from 0.x](https://github.com/jimutt/dld-kit/blob/main/docs/upgrading-from-0x.md): your decision records, `dld.config.yaml`, `INDEX.md` and `.dld-state.yaml` carry over unchanged. Coming from a 1.0 release candidate, run `npx dld-kit@latest update` and commit the result. The changes since 0.9.0:
  
  - **Install and update with one command.** `npx dld-kit init` sets DLD up in a repository for Claude Code, Antigravity, Codex, Cursor, OpenCode and Pi, and `npx dld-kit@latest update` upgrades it. DLD is also available as a Claude Code plugin, as Codex and Copilot CLI plugins, as a Pi package, and through `npx skills` and `gh skill`. The Tessl tile gets no new versions.
  - **The skills run a bundled Node CLI instead of bash scripts.** dld-kit needs Node.js 22 or newer and git.
  - **The always-on rule is installed for each agent,** in the file that agent loads, instead of a section appended to `CLAUDE.md`.
  - **Decisions are drafts until they reach the base branch.** After that their prose is protected: `decision_edits` sets how strictly, and `dld check-decision-edits` can enforce it in CI.
  - **`/dld-snapshot` generates `OVERVIEW.md`** and the documents you define in `snapshot_artifacts`. It no longer writes `SNAPSHOT.md`, and offers to delete an old one.
  - **Reviews are configurable:** `/dld-plan` can review the plan (`plan_review`), `review_model` picks the reviewers' model, and `dld.local.yaml` holds your own review settings, uncommitted.
  - **`/dld-reindex` commits the renames on top of your branch** and squashes only when asked, and `INDEX.md` merges with git's union driver.
  - **`/dld-audit` reports missing `amends` and `supersedes` links** that a decision's text states, and `annotation_exclude` keeps example annotations in docs out of the audit.
  - **From 1.0.0, versions follow semver** for everything a project builds on: the record format, annotations, the config files, the setup and CI commands, the installed layout, skill names and the install channels. See [What a version number promises](https://github.com/jimutt/dld-kit/blob/main/docs/releasing.md#what-a-version-number-promises).

## 1.0.0-rc.6

### Major Changes

- 8e204fd: dld-kit now needs Node.js 22 or newer; Node 20 reached end-of-life in April 2026, so upgrade Node before updating. From 1.0.0, dld-kit supports every Node.js line in active or maintenance LTS (now 22, 24 and 26) and may drop one in a minor release once it reaches end-of-life. The semver contract is now stated in full in `docs/releasing.md`: decision records, annotations, `dld.config.yaml`, the setup and CI commands, the installed layout, the skill names and arguments, the install channels and the file names in the decisions directory. Frontmatter fields dld-kit doesn't know are kept, and dld-kit never uses the `x-` prefix for fields or config keys, so it is yours.

### Minor Changes

- b9faabb: `/dld-snapshot` now generates only `OVERVIEW.md` (plus any `snapshot_artifacts` you define) and no longer writes `SNAPSHOT.md`. If your project has a `SNAPSHOT.md` from an earlier version, the next run offers to delete it; to keep generating a file by that name, add a `snapshot_artifacts` entry titled `SNAPSHOT.md` with your own prompt.
- 3aae751: `/dld-audit` no longer asks the agent to weigh every decision ID a record mentions. It reports a decision whose prose says it amends or supersedes another one that its frontmatter doesn't list as an issue, and lists likely relationships (change words such as "replaces" near an ID) as advisory; `find-missing-amends --all --mentions` still lists every mention. `create-decision` warns when the body states a relationship its flags leave out, and `/dld-decide` and `/dld-plan` check new decisions right after creating them.
- 39b9147: You can now choose the model review subagents run on, and review plans as well as code. `review_model` sets the reviewers' model, `implement_review_model` and `plan_review_model` override it per step, and `plan_review: true` makes `/dld-plan` have a subagent review the decisions it wrote (off by default). Set them for the team in `dld.config.yaml`, or for yourself in `dld.local.yaml`, a per-checkout file that `dld init` and `dld update` add to `.gitignore`; your own settings win, and asking in the request for one run wins over both.

### Patch Changes

- 046ba19: Repositories whose main branch is `master` now get a base branch without setting `base_branch`, so the decision-edit checks and `/dld-implement`'s list of proposed decisions work there; when no base branch is found at all, `/dld-implement` still lists every proposed decision. The skills that record decisions now pass the body through a quoted heredoc, so backticks, `$` and `%` in a decision are recorded as written instead of being run or mangled by the shell.
