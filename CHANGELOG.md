# dld-kit

## 1.0.0-rc.6

### Major Changes

- 8e204fd: dld-kit now needs Node.js 22 or newer; Node 20 reached end-of-life in April 2026, so upgrade Node before updating. From 1.0.0, dld-kit supports every Node.js line in active or maintenance LTS (now 22, 24 and 26) and may drop one in a minor release once it reaches end-of-life. The semver contract is now stated in full in `docs/releasing.md`: decision records, annotations, `dld.config.yaml`, the setup and CI commands, the installed layout, the skill names and arguments, the install channels and the file names in the decisions directory. Frontmatter fields dld-kit doesn't know are kept, and dld-kit never uses the `x-` prefix for fields or config keys, so it is yours.

### Minor Changes

- b9faabb: `/dld-snapshot` now generates only `OVERVIEW.md` (plus any `snapshot_artifacts` you define) and no longer writes `SNAPSHOT.md`. If your project has a `SNAPSHOT.md` from an earlier version, the next run offers to delete it; to keep generating a file by that name, add a `snapshot_artifacts` entry titled `SNAPSHOT.md` with your own prompt.
- 3aae751: `/dld-audit` no longer asks the agent to weigh every decision ID a record mentions. It reports a decision whose prose says it amends or supersedes another one that its frontmatter doesn't list as an issue, and lists likely relationships (change words such as "replaces" near an ID) as advisory; `find-missing-amends --all --mentions` still lists every mention. `create-decision` warns when the body states a relationship its flags leave out, and `/dld-decide` and `/dld-plan` check new decisions right after creating them.
- 39b9147: You can now choose the model review subagents run on, and review plans as well as code. `review_model` sets the reviewers' model, `implement_review_model` and `plan_review_model` override it per step, and `plan_review: true` makes `/dld-plan` have a subagent review the decisions it wrote (off by default). Set them for the team in `dld.config.yaml`, or for yourself in `dld.local.yaml`, a per-checkout file that `dld init` and `dld update` add to `.gitignore`; your own settings win, and asking in the request for one run wins over both.

### Patch Changes

- 046ba19: Repositories whose main branch is `master` now get a base branch without setting `base_branch`, so the decision-edit checks and `/dld-implement`'s list of proposed decisions work there; when no base branch is found at all, `/dld-implement` still lists every proposed decision. The skills that record decisions now pass the body through a quoted heredoc, so backticks, `$` and `%` in a decision are recorded as written instead of being run or mangled by the shell.
