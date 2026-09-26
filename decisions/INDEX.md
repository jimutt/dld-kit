# Decision Log

| ID | Title | Status | Tags |
|----|-------|--------|------|
| DL-013 | Run the bats suite against the CLI through a shim selected by DLD_BATS_TARGET | proposed | v1-core, testing, bats |
| DL-012 | Report errors on stderr with exit 1, usage errors with exit 2, and tolerate closed pipes | proposed | v1-core, cli, errors |
| DL-011 | Name CLI commands after the scripts they replace until the port is complete | proposed | v1-core, cli, commands |
| DL-010 | Resolve the project root with git rev-parse --show-toplevel | proposed | v1-core, config, git |
| DL-009 | Load dld.config.yaml with the bundled yaml package into a typed, validated Config | proposed | v1-core, config, yaml |
| DL-008 | Pass filesystem, git and environment to core through an injected Context | proposed | v1-core, architecture, testing |
| DL-007 | Split the code into src/core (library) and src/cli (command layer) | proposed | v1-core, architecture, layout |
| DL-006 | Biome for linting and formatting | accepted | v1-toolchain, lint, biome |
| DL-005 | CI runs typecheck, lint, all test layers on Node 20 and 22, and a package dry-run | accepted | v1-toolchain, ci, github-actions |
| DL-004 | Test with bun unit tests and node CLI integration tests; bats until the port completes | accepted | v1-toolchain, testing, bun, bats |
| DL-003 | Build with tsc for types and esbuild for a single-file bundle | accepted | v1-toolchain, build, esbuild |
| DL-002 | Publish as the npm package dld-kit with a dld command | accepted | v1-toolchain, packaging, npm |
| DL-001 | Node 20+ is the runtime; Bun is a development tool only | accepted | v1-toolchain, runtime, typescript |
