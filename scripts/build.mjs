// @decision(DL-003) @decision(DL-001)
import { chmod } from "node:fs/promises";
import { build } from "esbuild";

const outfile = "dist/dld.mjs";

await build({
  entryPoints: ["src/bin.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  legalComments: "none",
  logLevel: "warning",
});

await chmod(outfile, 0o755);
