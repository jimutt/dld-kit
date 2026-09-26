# Decision Log

| ID | Title | Status | Tags |
|----|-------|--------|------|
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
| DL-013 | Run the bats suite against the CLI through a shim selected by DLD_BATS_TARGET | accepted | v1-core, testing, bats |
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
