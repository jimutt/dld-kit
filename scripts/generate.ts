// @decision(DL-033)
// Generates skills/ and .claude/skills/ from templates/skills/, or with --check reports drift.
// Runs with Bun (a development tool); the generator itself is Node-compatible library code.
import { join, resolve } from "node:path";
import { version } from "../package.json";
import { ADAPTERS } from "../src/generate/adapters.ts";
import { diffOutput, generateSkills, writeOutput } from "../src/generate/generate.ts";
import { createNodeContext } from "../src/node-context.ts";

const root = resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const ctx = createNodeContext(root, process.env);

let drift = 0;
for (const adapter of ADAPTERS) {
  const files = generateSkills(ctx, join(root, "templates/skills"), adapter, version);
  const outDir = join(root, adapter.outputDir);
  const diff = check ? diffOutput(ctx, outDir, files) : writeOutput(ctx, outDir, files);
  const report = [
    ...diff.changed.map((p) => `changed: ${adapter.outputDir}/${p}`),
    ...diff.missing.map((p) => `missing: ${adapter.outputDir}/${p}`),
    ...diff.extra.map((p) => `extra:   ${adapter.outputDir}/${p}`),
  ];
  drift += report.length;
  if (check) for (const line of report) console.error(line);
  else console.log(`${adapter.outputDir}: ${files.size} files, ${report.length} updated`);
}

if (check && drift > 0) {
  console.error("\nGenerated skills are out of date. Run: npm run generate");
  process.exit(1);
}
if (check) console.log("generated skills are up to date");
