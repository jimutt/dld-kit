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
  // Bundled CommonJS dependencies (yaml) call require() for Node built-ins.
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __dldCreateRequire } from "node:module";',
      "const require = __dldCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  legalComments: "none",
  logLevel: "warning",
});

await chmod(outfile, 0o755);
