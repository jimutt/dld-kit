# Releasing dld-kit

`package.json` holds the only version (DL-052). `npm run generate` writes it into every generated file: skill stamps, rule notices, the plugin manifests and the marketplace entries.

## What a version number promises

Semantic versioning covers the setup commands, `dld init`, `update`, `install-rule` and `session-context` (their flags, exit codes and documented output), plus `--help` and `--version` (DL-056). A breaking change to those needs a major version.

All other commands are internal: the skills run them from the CLI copy bundled with the same version of the skills. A minor release may rename them or change their arguments or output, as long as the skill templates change with them. `dld --help` lists them under "Commands the skills run". The library API is internal too (DL-002).

## Release branch

`main` is the release branch. Release candidates (`1.0.0-rc.N`) are tagged on it until 1.0.0 (DL-058, DL-062). A new candidate follows each round of fixes until the candidates run clean in real repositories; there is no fixed number and no date. The `v1` integration branch is retired.

The workflow publishes a candidate under the npm `next` dist-tag and as a GitHub prerelease. Until 1.0.0, each candidate is also the default install. After the workflow finishes, make it so by hand:

```bash
npm dist-tag add dld-kit@1.0.0-rc.4 latest                    # npx dld-kit, pi install npm:dld-kit
gh release edit v1.0.0-rc.4 --prerelease=false --latest       # gh skill install jimutt/dld-kit
```

The Claude Code, Codex and Copilot CLI marketplaces and `npx skills` read `main`, so they serve a candidate once it is merged there.

### Releasing 1.0.0

Not done yet. When the candidates are clean:

1. On `main`, run `npm version 1.0.0` and push the tag, as below. The workflow publishes it to `latest` and as the latest GitHub release; no manual steps.
2. In the same release, remove the README's release-candidate note.
3. Mark `docs/plan/v1.md` as done.

## Release a version

1. On `main`, with a clean working tree:

   ```bash
   npm version 1.2.0          # or 1.2.0-rc.1 for a prerelease
   ```

   This bumps `package.json`, runs `npm run generate`, stages the generated files, commits, and tags `v1.2.0`.
2. Push the commit and the tag:

   ```bash
   git push origin HEAD --follow-tags
   ```

3. `.github/workflows/release.yml` runs on the tag, in three jobs:
   - **verify** (no publish rights): fails unless the tag is `v` plus the `package.json` version, runs Biome, the typecheck, `npm test` and `npm run check:pack`, then packs the tarball.
   - **publish** (in the `npm` environment, with `id-token: write`): publishes that tarball with `npm publish` through trusted publishing: no token, provenance attached. It installs and runs nothing from the project. A version with a prerelease part (`1.2.0-rc.1`) is published under the `next` dist-tag; others go to `latest`.
   - **release**: creates a GitHub release for the tag with generated notes, marked as a prerelease when the version is one.

Claude Code plugin users get the new version once the release is on the default branch, since the plugin's `version` changes. `gh skill install jimutt/dld-kit` installs the latest GitHub release.

## Checks by hand before a release

CI covers the CLI, the generated files and the `npx skills` install (`npm run check:installers`, DL-051). It never starts an agent, so a candidate is only as tested as the agents someone has run it in. The checks below are how a candidate is judged clean (DL-058). Run them for as many agents as you can, and write the results (agent, agent version, pass or fail per step) in the candidate's GitHub release notes.

### The same steps in every agent

In a scratch git repository, for the agent under test:

1. **Install.** Use the agent's channel from the list below. Check that the listed files exist, and that nothing else changed.
2. **Rule in context.** Start a new session and ask: "Without reading files or running commands: what are you told to do before modifying code annotated with `@decision`?" A pass quotes the DLD rule: look the decision up with dld-lookup first. A vague answer or a file read is a fail.
3. **Run a skill.** Ask the agent to use dld-decide to record a small decision. A pass leaves `decisions/records/DL-001.md` and an updated `decisions/INDEX.md`. The skill must run the bundled CLI (`dld-common/scripts/dld.mjs`) without errors.
4. **Look it up.** Add `// @decision(DL-001)` to a source file, then ask the agent to change that file. A pass reads DL-001 (through dld-lookup) before editing.
5. **Update.** Run `npx dld-kit@next update`. A pass reports `0 written` for every skills directory and prints no warnings.

### What differs per agent

- **Claude Code** (`npx dld-kit@next init --yes --agent claude`)
  - Expect `.claude/skills/dld-*` and `.claude/rules/dld-workflow.md`. With `--agent claude,codex` in a project without `CLAUDE.md`, the block goes into `AGENTS.md`. Expect `.claude/CLAUDE.md` holding `@../AGENTS.md` instead of the rule file.
  - Run skills as `/dld-decide`. `dld-common` must not appear in the `/` menu.
  - Step 3 must not prompt for permission to run `node ".../dld-common/scripts/dld.mjs"`: the skills' `allowed-tools` pre-approves it. This is unverified, since headless `claude -p` does not apply it.
- **Claude Code plugin** (`claude plugin marketplace add jimutt/dld-kit`, then `claude plugin install dld@dld-kit`)
  - Run `/dld-init` in a project without DLD, then the common steps.
  - In a project with `dld.config.yaml` and no rule file, step 2 passes through the plugin's SessionStart hook. Once `/dld-init` has installed `.claude/rules/dld-workflow.md`, the hook prints nothing (`dld session-context --agent claude` is empty).
- **Codex** (`npx dld-kit@next init --yes --agent codex`)
  - Expect `.agents/skills/dld-*` and the block in `AGENTS.md`.
  - In a project that has only a `CLAUDE.md`, `init` must create `AGENTS.md` for the block (DL-061).
- **Cursor** (`npx dld-kit@next init --yes --agent cursor`)
  - Expect `.agents/skills/dld-*` and the block in `AGENTS.md`.
  - In a project that has only a `CLAUDE.md`, the block goes into `CLAUDE.md`, and step 2 must still pass (DL-061).
  - With `--agent claude,cursor`, Cursor sees each skill in `.claude/skills/` and `.agents/skills/`. Note which copy step 3 runs; either copy must work (DL-046).
- **OpenCode 2.x** (`npx dld-kit@next init --yes --agent opencode`)
  - Expect `.agents/skills/dld-*` and the block in `AGENTS.md`.
  - With `--agent claude,opencode`, OpenCode must load the `.agents/skills/` copy of each skill.
- **Pi** (`pi install -l npm:dld-kit`, then `/skill:dld-init`)
  - This installs the `latest` dist-tag. Point it at the candidate first (`npm dist-tag add dld-kit@<version> latest`).
  - `dld-init` should install the block in `AGENTS.md`, or in `CLAUDE.md` when that is the only instruction file.
  - Run skills as `/skill:dld-decide`.
  - Repeat with `npx dld-kit@next init --yes --agent pi,codex` in a project that has only a `CLAUDE.md`: it must warn that Pi now reads `AGENTS.md`.
- **Antigravity** (`npx dld-kit@next init --yes --agent antigravity`)
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

2. In the GitHub repository settings, create the environment `npm`. Under deployment branches and tags, allow only tags matching `v*`. Optionally add yourself as a required reviewer, so each publish waits for approval.
3. On npmjs.com, open the `dld-kit` package settings, and add a trusted publisher:
   - GitHub Actions
   - repository `jimutt/dld-kit`
   - workflow `release.yml`
   - environment `npm`
4. In the same settings, under publishing access, require two-factor authentication and disallow tokens.

npm checks the repository, workflow and environment of each publish. The environment's tag rule is what stops a branch, or an edited copy of the workflow, from publishing.

From then on, releases publish only from the workflow.
