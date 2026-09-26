// @decision(DL-033)
// Generates skills/ and .claude/skills/ from templates/skills/, and this repository's Claude Code
// rule file from templates/rules/, or with --check reports drift.
// Runs with Bun (a development tool); the generator itself is Node-compatible library code.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { version } from "../package.json";
import { DldError } from "../src/core/errors.ts";
import { writeFileAtomic } from "../src/core/files.ts";
import { ADAPTERS } from "../src/generate/adapters.ts";
import { diffOutput, generateSkills, writeOutput } from "../src/generate/generate.ts";
import { CLAUDE_RULE_FILE, RULE_TEXT, renderRuleFile } from "../src/generate/rule.ts";
import { createNodeContext } from "../src/node-context.ts";

const root = resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const ctx = createNodeContext(root, process.env);

// @decision(DL-035)
// The skills ship the CLI built from this checkout, so build it first.
const build = spawnSync("node", [join(root, "scripts/build.mjs")], {
  cwd: root,
  stdio: ["ignore", "ignore", "inherit"],
});
if (build.error !== undefined) {
  console.error(`Error: could not run the build: ${build.error.message}`);
  process.exit(1);
}
if (build.status !== 0) process.exit(build.status ?? 1);
const extraFiles = new Map([
  [
    "dld-common/scripts/dld.mjs",
    { content: readFileSync(join(root, "dist/dld.mjs"), "utf8"), mode: 0o755 },
  ],
]);

let drift = 0;
try {
  for (const adapter of ADAPTERS) {
    const files = generateSkills(ctx, join(root, "templates/skills"), adapter, version, {
      extraFiles,
    });
    const outDir = join(root, adapter.outputDir);
    const diff = check ? diffOutput(ctx, outDir, files) : writeOutput(ctx, outDir, files);
    const report = [
      ...diff.changed.map((p) => `changed: ${adapter.outputDir}/${p}`),
      ...diff.missing.map((p) => `missing: ${adapter.outputDir}/${p}`),
      ...diff.extra.map((p) => `extra:   ${adapter.outputDir}/${p}`),
    ];
    drift += report.length;
    if (check) {
      for (const line of report) console.error(line);
    } else {
      const written = diff.changed.length + diff.missing.length;
      console.log(
        `${adapter.outputDir}: ${files.size} files, ${written} written, ${diff.extra.length} removed`,
      );
    }
  }

  // @decision(DL-047)
  const rulePath = join(root, CLAUDE_RULE_FILE);
  const rule = renderRuleFile("claude-file", RULE_TEXT, version);
  const current = existsSync(rulePath) ? readFileSync(rulePath, "utf8") : undefined;
  if (current !== rule) {
    drift += 1;
    if (check)
      console.error(`${current === undefined ? "missing" : "changed"}: ${CLAUDE_RULE_FILE}`);
    else {
      ctx.fs.mkdir(dirname(rulePath));
      writeFileAtomic(ctx, rulePath, rule);
      console.log(`${CLAUDE_RULE_FILE}: written`);
    }
  }
} catch (error) {
  if (!(error instanceof DldError)) throw error;
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

if (check && drift > 0) {
  console.error("\nGenerated files are out of date. Run: npm run generate");
  process.exit(1);
}
if (check) console.log("generated files are up to date");
