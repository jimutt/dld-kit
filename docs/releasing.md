# Releasing dld-kit

`package.json` holds the only version (DL-052). `npm run generate` writes it into every generated file: skill stamps, rule notices, the plugin manifests and the marketplace entries.

## What a version number promises

From 1.0.0, a breaking change to any of these needs a major version (DL-085):

- **Decision records:** where they live (`records/` under the decisions directory, a subdirectory per namespace), their file names (`DL-<number>.md`), the ID syntax, the frontmatter fields and what they mean, the statuses and their lifecycle, and the body's section headings (Context, Decision, Rationale, Consequences), which the skills and the CLI read ([format spec](framework/decision-record-format.md)).
- **Your own fields and keys:** frontmatter fields dld-kit doesn't know are kept, and are otherwise left alone except that renames rewrite decision IDs anywhere in a record. dld-kit never adds a frontmatter field or config key starting with `x-`, so use that prefix for your own; any other new field or key comes in a minor release and its changeset names it.
- **Annotations:** the `@decision(DL-NNN)` syntax and `annotation_prefix`.
- **`dld.config.yaml`:** at the repository root, with its keys, their values and defaults ([configuration spec](framework/project-configuration.md)). A minor release may add keys; an unknown key is a warning, never an error, throughout 1.x.
- **The setup and CI commands:** `dld init`, `update`, `install-rule`, `session-context` and `check-decision-edits`, with their flags, the `--agent` names (`claude`, `antigravity`, `codex`, `cursor`, `opencode`, `pi`), exit codes and documented output, plus `--help` and `--version` (DL-056, DL-073), and the `Decision-Edit` commit trailer.
- **The installed layout:** where `init` and `update` put the skills and the always-on rule for each agent, and the `<!-- dld-kit:start -->` / `<!-- dld-kit:end -->` markers around the rule block in instruction files. A 1.x `update` upgrades any install an earlier 1.x made.
- **Skills:** the names `dld-init`, `dld-decide`, `dld-plan`, `dld-implement`, `dld-lookup`, `dld-adjust`, `dld-audit`, `dld-audit-auto`, `dld-snapshot`, `dld-status`, `dld-retrofit` and `dld-reindex`, the arguments their documentation gives, and the name of the shared `dld-common` skill, which every other skill needs installed beside it. Removing or renaming a skill, or dropping a documented argument, is breaking; adding one is not.
- **Distribution:** the repository `jimutt/dld-kit` that the marketplaces and installers name; the npm package `dld-kit` and its `dld` bin; the Claude Code plugin `dld` in the marketplace `dld-kit`; the Codex and Copilot CLI plugin and marketplaces; the Pi package; and the `skills/` layout that `npx skills`, `gh skill` and manual copies read.
- **File names in the decisions directory:** the ones dld-kit writes (`INDEX.md`, `OVERVIEW.md`, the files named in `snapshot_artifacts`, `.dld-state.yaml`) and the ones the skills read (`PRACTICES.md`, at the top and in each namespace).
- **Supported Node.js versions:** every release line in active or maintenance LTS, currently 22, 24 and 26 (DL-086). When a line reaches end-of-life, a minor release may stop supporting it, and its changeset says so.

These can change in a minor release:

- the wording and steps of the skills, and the text of the always-on rule;
- the commands the skills run: the skills run them from the CLI copy bundled with the same version of the skills, so a minor release may rename them or change their arguments or output as long as the skill templates change with them. `dld --help` lists them under "Commands the skills run", apart from the "Setup and CI commands";
- the layout of `.dld-state.yaml`, and the content and format of generated documents such as `INDEX.md` and `OVERVIEW.md`;
- the library API (DL-002) and where the CLI sits inside the skills.

When you write a changeset, check the change against the first list: anything on it that breaks for users needs `major`.

## How a release happens

Releases go through [Changesets](https://github.com/changesets/changesets) (DL-081).

1. **Every pull request adds a changeset**: run `npx changeset`, pick the bump (patch, minor or major), and write one or two sentences for the changelog, from a user's point of view. A pull request that changes nothing shipped adds an empty one with `npx changeset --empty`. CI fails a pull request without a changeset.
2. **The Version Packages pull request.** When changesets reach `main`, `.github/workflows/release.yml` opens or updates a pull request titled "Version Packages". It runs `npm run version-packages`: `changeset version` bumps `package.json` and writes `CHANGELOG.md`, then `npm run generate` puts the new version in every stamp and manifest. CI does not run on this pull request, because GitHub Actions opened it; the release checks below run before anything is published.
3. **Merging it releases.** On that push to `main`, the workflow sees a version npm doesn't have yet and runs three jobs:
   - **verify** (no publish rights): runs Biome, the typecheck, `npm test` and `npm run check:pack`, packs the tarball, and takes the version's section of `CHANGELOG.md` as release notes.
   - **publish** (in the `npm` environment, with `id-token: write`): publishes that tarball with `npm publish` through trusted publishing: no token, provenance attached. It installs and runs nothing from the project.
   - **release**: creates the `v<version>` tag on the released commit and the GitHub release, with the changelog section followed by GitHub's generated list of pull requests.

If a run fails, fix the cause and rerun it from the Actions tab, or start the workflow by hand on `main` (`workflow_dispatch`).

### Release candidates

Until 1.0.0 the repository is in Changesets pre mode with the tag `rc` (`.changeset/pre.json`), so versions continue `1.0.0-rc.6`, `1.0.0-rc.7`, and so on (DL-058). Each candidate is the default install (DL-062): the workflow publishes it to npm `latest` and makes its GitHub release the latest release. There are no manual steps.

The Claude Code, Codex and Copilot CLI marketplaces and `npx skills` read `main`, so they serve a version as soon as its Version Packages pull request is merged.

### Releasing 1.0.0

When the candidates are clean, in one pull request:

1. Run `npx changeset pre exit`, so the next version is `1.0.0`.
2. Remove the README's release-candidate note.
3. Mark `docs/plan/v1.md` as done.

Merge it, then merge the Version Packages pull request it produces. After 1.0.0, prereleases (if any) go to npm `next` as GitHub prereleases, and releases to `latest`.

## Settings the workflow needs

- The GitHub environment `npm` (see below) allows deployments from the `main` branch.
- Under Settings → Actions → General, "Allow GitHub Actions to create and approve pull requests" is on, so the workflow can open the Version Packages pull request. The workflow never approves or merges it.

## Checks by hand before a release

CI covers the CLI, the generated files and the `npx skills` install (`npm run check:installers`, DL-051). It never starts an agent, so a candidate is only as tested as the agents someone has run it in. The checks below are how a candidate is judged clean (DL-058). Run them for as many agents as you can, and write the results (agent, agent version, pass or fail per step) in the candidate's GitHub release notes, by editing the release after the workflow creates it.

### The same steps in every agent

In a scratch git repository, for the agent under test:

1. **Install.** Use the agent's channel from the list below. Check that the listed files exist, and that nothing else changed.
2. **Rule in context.** Start a new session and ask: "Without reading files or running commands: what are you told to do before modifying code annotated with `@decision`?" A pass quotes the DLD rule: look the decision up with dld-lookup first. A vague answer or a file read is a fail.
3. **Run a skill.** Ask the agent to use dld-decide to record a small decision. A pass leaves `decisions/records/DL-001.md` and an updated `decisions/INDEX.md`. The skill must run the bundled CLI (`dld-common/scripts/dld.mjs`) without errors.
4. **Look it up.** Add `// @decision(DL-001)` to a source file, then ask the agent to change that file. A pass reads DL-001 (through dld-lookup) before editing.
5. **Update.** Run `npx dld-kit@latest update`. A pass reports `0 written` for every skills directory and prints no warnings.

### What differs per agent

- **Claude Code** (`npx dld-kit@latest init --yes --agent claude`)
  - Expect `.claude/skills/dld-*` and `.claude/rules/dld-workflow.md`. With `--agent claude,codex` in a project without `CLAUDE.md`, the block goes into `AGENTS.md`. Expect `.claude/CLAUDE.md` holding `@../AGENTS.md` instead of the rule file.
  - Run skills as `/dld-decide`. `dld-common` must not appear in the `/` menu.
  - Step 3 must not prompt for permission to run `node ".../dld-common/scripts/dld.mjs"`: the skills' `allowed-tools` pre-approves it. This is unverified, since headless `claude -p` does not apply it.
- **Claude Code plugin** (`claude plugin marketplace add jimutt/dld-kit`, then `claude plugin install dld@dld-kit`)
  - Run `/dld-init` in a project without DLD, then the common steps.
  - In a project with `dld.config.yaml` and no rule file, step 2 passes through the plugin's SessionStart hook. Once `/dld-init` has installed `.claude/rules/dld-workflow.md`, the hook prints nothing (`dld session-context --agent claude` is empty).
- **Codex** (`npx dld-kit@latest init --yes --agent codex`)
  - Expect `.agents/skills/dld-*` and the block in `AGENTS.md`.
  - In a project that has only a `CLAUDE.md`, `init` must create `AGENTS.md` for the block (DL-061).
- **Cursor** (`npx dld-kit@latest init --yes --agent cursor`)
  - Expect `.agents/skills/dld-*` and the block in `AGENTS.md`.
  - In a project that has only a `CLAUDE.md`, the block goes into `CLAUDE.md`, and step 2 must still pass (DL-061).
  - With `--agent claude,cursor`, Cursor sees each skill in `.claude/skills/` and `.agents/skills/`. Note which copy step 3 runs; either copy must work (DL-046).
- **OpenCode 2.x** (`npx dld-kit@latest init --yes --agent opencode`)
  - Expect `.agents/skills/dld-*` and the block in `AGENTS.md`.
  - With `--agent claude,opencode`, OpenCode must load the `.agents/skills/` copy of each skill.
- **Pi** (`pi install -l npm:dld-kit`, then `/skill:dld-init`)
  - This installs the `latest` dist-tag, which is the newest candidate.
  - `dld-init` should install the block in `AGENTS.md`, or in `CLAUDE.md` when that is the only instruction file.
  - Run skills as `/skill:dld-decide`.
  - Repeat with `npx dld-kit@latest init --yes --agent pi,codex` in a project that has only a `CLAUDE.md`: it must warn that Pi now reads `AGENTS.md`.
- **Antigravity** (`npx dld-kit@latest init --yes --agent antigravity`)
  - Expect `.agents/skills/dld-*` and `.agents/rules/dld-workflow.md`, whose frontmatter is `trigger: always_on`.
  - Step 2 checks that the rule loads in every conversation.
- **Codex and Copilot CLI plugins** (`codex plugin marketplace add jimutt/dld-kit`, `copilot plugin marketplace add jimutt/dld-kit`)
  - The dld-init skill installs the rule with `--agent codex` for Copilot CLI.
- **`gh skill`** (`gh skill install jimutt/dld-kit --all`)
  - Every `dld-*` skill arrives once, `dld-common/scripts/dld.mjs` is present, and nothing comes from `claude-plugin/`.
  - CI does not cover `gh skill`, because it needs an authenticated `gh` and a release tag.

## One-time npm setup

Trusted publishing needs the package to exist on npm first.

1. Publish the first version by hand from a clean checkout of the release commit:

   ```bash
   npm login
   npm publish            # add --tag next for a prerelease
   ```

2. In the GitHub repository settings, create the environment `npm`. Under deployment branches and tags, allow only the `main` branch. Optionally add yourself as a required reviewer, so each publish waits for approval.
3. On npmjs.com, open the `dld-kit` package settings, and add a trusted publisher:
   - GitHub Actions
   - repository `jimutt/dld-kit`
   - workflow `release.yml`
   - environment `npm`
4. In the same settings, under publishing access, require two-factor authentication and disallow tokens.

npm checks the repository, workflow and environment of each publish. The environment's branch rule is what stops another branch, or an edited copy of the workflow on one, from publishing.

From then on, releases publish only from the workflow.
