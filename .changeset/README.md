# Changesets

Every pull request adds a changeset: run `npx changeset`, pick the bump, and write one or two sentences for the changelog, from a user's point of view. If nothing shipped changes (docs, CI, tests), run `npx changeset --empty`.

Merging pull requests with changesets into `main` opens a "Version Packages" pull request; merging that one publishes the release. See [docs/releasing.md](../docs/releasing.md) and DL-081.

The repository is in pre mode (`pre.json`, tag `rc`) until 1.0.0.
