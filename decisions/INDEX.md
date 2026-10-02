# Decision Log

| ID | Title | Status | Tags |
|----|-------|--------|------|
| DL-068 | Rule line and skill end steps that check edits to integrated decisions | accepted | decision-edits, skills |
| DL-067 | decision_edits setting: block (default), ask or allow for integrated decision prose | accepted | decision-edits, config |
| DL-066 | Decision prose locks when the record reaches the base branch; frontmatter stays editable | accepted | decision-edits |
| DL-065 | Records this branch got from an open PR are not collisions with it | accepted | reindex |
| DL-064 | Reindex commits the renames on top of the branch; squash only on request | accepted | reindex, git |
| DL-063 | Restructure the README as a short entry point and move reference material to docs/ | accepted | docs, readme |
| DL-062 | Merge v1 into main during the release candidates and make each candidate the default install | accepted | v1-release, release |
| DL-061 | Correct the instruction files Cursor and OpenCode read, and place a new rule block where every target harness reads it | accepted | v1-release, rule, harnesses |
| DL-060 | Skip the agent configuration directories that hold installed skills when scanning for annotations | accepted | v1-release, annotations, audit |
| DL-059 | Move the pinned GitHub Actions to their Node 24 majors, still pinned by commit SHA | accepted | v1-release, ci, github-actions |
| DL-058 | Ship workstream 10 as 1.0.0-rc.3 from v1; release 1.0.0 from main only after the release candidates run clean | accepted | v1-release, release |
| DL-057 | Migrate pre-1.0 installs with dld update and document it in the README | accepted | v1-release, migration, docs |
| DL-056 | The semver contract covers the setup commands; the commands the skills run are internal | accepted | v1-release, cli, commands |
| DL-055 | Give Claude Code the AGENTS.md block through a dld-kit .claude/CLAUDE.md import, and follow AGENTS.md imports | accepted | v1-release, rule, claude-code |
| DL-054 | Resolve the instruction file each agent reads from Claude Code's documented rules and the planned block | accepted | rule, harnesses |
| DL-053 | Rewrite the README around the 1.0 install channels | accepted | v1-distribution, docs |
| DL-052 | Release from a version tag with npm trusted publishing; package.json holds the one version | accepted | v1-distribution, release, npm, ci |
| DL-051 | Coexist with npx skills and gh skill installs, and check the installers in CI | accepted | v1-distribution, skills, npx-skills, ci |
| DL-050 | Publish portable plugin manifests for Codex and Copilot CLI, and a Pi package entry | accepted | v1-distribution, plugin, codex, copilot, pi |
| DL-049 | Print the rule from a plugin SessionStart hook through dld session-context | accepted | v1-distribution, rule, claude-code, plugin |
| DL-048 | Ship a Claude Code plugin generated into claude-plugin/, with a marketplace in the same repository | accepted | v1-distribution, claude-code, plugin |
| DL-047 | Install the rule through the CLI from the dld-init skill and in this repository | accepted | v1-init-update, rule, skills |
| DL-046 | Keep generated skills usable in harnesses that read another harness's directory | accepted | v1-init-update, skills, harnesses |
| DL-045 | Deliver the always-on rule through owned rule files and a managed AGENTS.md block | accepted | v1-init-update, rule, harnesses |
| DL-044 | Use one generated-file notice that holds in every install | accepted | v1-init-update, skills |
| DL-043 | Own the dld-* skill directories on update: overwrite, prune, refuse downgrades | accepted | v1-init-update, skills, migration |
| DL-042 | Ship templates in the npm package; the CLI installs itself into dld-common | accepted | v1-init-update, packaging, npm |
| DL-041 | Target harnesses by name, detect them, and confirm the selection | accepted | v1-init-update, harnesses |
| DL-040 | Add dld init and dld update for project setup through npm | accepted | v1-init-update, cli, commands |
| DL-039 | Drop the no-op user_invocable line from Claude Code skills | accepted | v1-skills-cli, skills |
| DL-038 | Development docs describe the CLI-only toolkit | accepted | v1-skills-cli, docs |
| DL-037 | Remove the bash scripts and the bats suite after a coverage audit | accepted | v1-skills-cli, testing |
| DL-036 | A dld placeholder renders the CLI invocation per harness | accepted | v1-skills-cli, skills |
| DL-035 | Skills always use the CLI bundled in dld-common | accepted | v1-skills-cli, skills, distribution |
| DL-034 | Retire Tessl packaging and the hand-maintained skill copy | accepted | v1-generator, distribution |
| DL-033 | Commit generated skills and check them for drift | accepted | v1-generator, skills, testing |
| DL-032 | Generate skills through an adapter registry in src/generate | accepted | v1-generator, skills |
| DL-031 | Canonical skill templates with a single script placeholder | accepted | v1-generator, skills |
| DL-030 | Port commit-reindex with literal staging and full rollback | accepted | v1-port-reindex, reindex, git |
| DL-029 | Port rename-decision and find-stale-mentions with the scanner file filter and byte-preserving rewrites | accepted | v1-port-reindex, reindex, annotations |
| DL-028 | Validate the rename plan before acting on it | accepted | v1-port-reindex, reindex, security |
| DL-027 | Port the reindex planning commands on one core computation | accepted | v1-port-reindex, reindex |
| DL-026 | Scan open PRs through Context.gh and report every skipped scan | accepted | v1-port-reindex, reindex, context |
| DL-025 | Port the snapshot scripts with their current semantics and deterministic ordering | accepted | v1-port-audit, snapshot |
| DL-024 | Port find-missing-amends with parsed records and the same changed-since-audit filter | accepted | v1-port-audit, audit, records |
| DL-023 | Let projects exclude paths from annotation scanning with an annotation_exclude config key | accepted | v1-port-audit, annotations, config |
| DL-022 | Port find-annotations onto the shared scanner, reporting only IDs inside annotations | accepted | v1-port-audit, annotations, audit |
| DL-021 | Read and update .dld-state.yaml section by section with the yaml Document API and the failsafe schema | accepted | v1-port-audit, state, yaml |
| DL-020 | Report unit-test coverage on PRs with a self-hosted comment and a 90% floor | accepted | v1-port-common, ci, coverage, testing |
| DL-019 | Scan for annotations with one core scanner over git's file list and a single exclusion list | accepted | v1-port-common, annotations, audit |
| DL-018 | Render INDEX.md with a single renderer that matches regenerate-index.sh byte for byte | accepted | v1-port-common, index |
| DL-017 | Handle -h/--help inside parseCommandArgs instead of scanning raw arguments | accepted | v1-port-common, cli, commands |
| DL-016 | Give Context standard input and a clock | accepted | v1-port-common, context, testing |
| DL-015 | Write files atomically through new Context operations, and create new files exclusively | accepted | v1-port-common, filesystem, context |
| DL-014 | Parse decision records with yaml, edit their metadata line by line, and render new records from a fixed template | accepted | v1-port-common, records, frontmatter |
| DL-013 | Run the bats suite against the CLI through a shim selected by DLD_BATS_TARGET | superseded | v1-core, testing, bats |
| DL-012 | Report errors on stderr with exit 1, usage errors with exit 2, and tolerate closed pipes | accepted | v1-core, cli, errors |
| DL-011 | Name CLI commands after the scripts they replace until the port is complete | accepted | v1-core, cli, commands |
| DL-010 | Resolve the project root with git rev-parse --show-toplevel | accepted | v1-core, config, git |
| DL-009 | Load dld.config.yaml with the bundled yaml package into a typed, validated Config | accepted | v1-core, config, yaml |
| DL-008 | Pass filesystem, git and environment to core through an injected Context | accepted | v1-core, architecture, testing |
| DL-007 | Split the code into src/core (library) and src/cli (command layer) | accepted | v1-core, architecture, layout |
| DL-006 | Biome for linting and formatting | accepted | v1-toolchain, lint, biome |
| DL-005 | CI runs typecheck, lint, all test layers on Node 20 and 22, and a package dry-run | accepted | v1-toolchain, ci, github-actions |
| DL-004 | Test with bun unit tests and node CLI integration tests; bats until the port completes | accepted | v1-toolchain, testing, bun, bats |
| DL-003 | Build with tsc for types and esbuild for a single-file bundle | accepted | v1-toolchain, build, esbuild |
| DL-002 | Publish as the npm package dld-kit with a dld command | accepted | v1-toolchain, packaging, npm |
| DL-001 | Node 20+ is the runtime; Bun is a development tool only | accepted | v1-toolchain, runtime, typescript |
