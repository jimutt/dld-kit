# Releasing dld-kit

`package.json` holds the only version (DL-052). `npm run generate` writes it into every generated file: skill stamps, rule notices, the plugin manifests and the marketplace entries.

## Release a version

1. On the release branch, with a clean working tree:

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
