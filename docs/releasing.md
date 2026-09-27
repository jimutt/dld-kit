# Releasing dld-kit

`package.json` holds the only version (DL-052). `npm run generate` writes it into every generated file: skill stamps, rule notices, the plugin manifests and the marketplace entries.

## What a version number promises

Semantic versioning covers the setup commands, `dld init`, `update`, `install-rule` and `session-context` (their flags, exit codes and documented output), plus `--help` and `--version` (DL-056). A breaking change to those needs a major version.

All other commands are internal: the skills run them from the CLI copy bundled with the same version of the skills. A minor release may rename them or change their arguments or output, as long as the skill templates change with them. `dld --help` lists them under "Commands the skills run". The library API is internal too (DL-002).

## Release branch

Until 1.0.0, release candidates (`1.0.0-rc.N`) are tagged on `v1` and published under the `next` dist-tag (DL-058). A new candidate follows each round of fixes until the candidates run clean in real repositories; there is no fixed number and no date.

`main` still holds the pre-1.0 skills, and the Claude Code, Codex and Copilot CLI marketplaces read the default branch. To test a candidate's plugin, add the marketplace at the `v1` ref: `claude plugin marketplace add jimutt/dld-kit#v1`.

### Releasing 1.0.0

Not done yet. When the candidates are clean:

1. Merge `v1` into `main` (PR #76), so the marketplaces serve the 1.0 plugin.
2. On `main`, run `npm version 1.0.0` and push the tag, as below.
3. In the same release, remove the README's "Early development" note.
4. Retire `v1`: remove it from the `push` branches in `.github/workflows/test.yml`, and change this document to name `main` as the release branch.
5. Mark `docs/plan/v1.md` as done.

## Release a version

1. On the release branch (`v1` until 1.0.0, then `main`), with a clean working tree:

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

- `gh skill install jimutt/dld-kit --all` in a scratch project: every `dld-*` skill arrives once, `dld-common/scripts/dld.mjs` is present, and nothing comes from `claude-plugin/`. CI does not cover `gh skill`, because it needs an authenticated `gh` and a release tag.
- `npm run check:installers` runs the pinned `npx skills` check CI runs (DL-051).

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
