// @decision(DL-033)
// Generates skills/, .claude/skills/ and the Claude Code plugin's skills from templates/skills/,
// this repository's Claude Code rule file from templates/rules/, and the plugin and marketplace
// manifests from package.json; with --check it reports drift instead.
// Runs with Bun (a development tool); the generator itself is Node-compatible library code.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import pkg from "../package.json";
import { DldError } from "../src/core/errors.ts";
import { writeFileAtomic } from "../src/core/files.ts";
import { agentSkillsAdapter, claudeCodeAdapter } from "../src/generate/adapters.ts";
import { diffOutput, generateSkills, writeOutput } from "../src/generate/generate.ts";
import {
  CLAUDE_PLUGIN_DIR,
  CLAUDE_PLUGIN_SKILLS,
  renderPluginFiles,
} from "../src/generate/plugins.ts";
import { CLAUDE_RULE_FILE, RULE_TEXT, renderRuleFile } from "../src/generate/rule.ts";
import { createNodeContext } from "../src/node-context.ts";

const root = resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const ctx = createNodeContext(root, process.env);
const { version } = pkg;

// @decision(DL-048)
/** Each adapter's output directories; the Claude Code plugin reuses the claude-code rendering. */
const OUTPUTS = [
  { adapter: agentSkillsAdapter, dirs: [agentSkillsAdapter.outputDir] },
  { adapter: claudeCodeAdapter, dirs: [claudeCodeAdapter.outputDir, CLAUDE_PLUGIN_SKILLS] },
];

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
  for (const { adapter, dirs } of OUTPUTS) {
    const files = generateSkills(ctx, join(root, "templates/skills"), adapter, version, {
      extraFiles,
    });
    for (const dir of dirs) {
      const outDir = join(root, dir);
      const diff = check ? diffOutput(ctx, outDir, files) : writeOutput(ctx, outDir, files);
      const report = [
        ...diff.changed.map((p) => `changed: ${dir}/${p}`),
        ...diff.missing.map((p) => `missing: ${dir}/${p}`),
        ...diff.extra.map((p) => `extra:   ${dir}/${p}`),
      ];
      drift += report.length;
      if (check) {
        for (const line of report) console.error(line);
      } else {
        const written = diff.changed.length + diff.missing.length;
        console.log(
          `${dir}: ${files.size} files, ${written} written, ${diff.extra.length} removed`,
        );
      }
    }
  }

  // @decision(DL-047) @decision(DL-048) @decision(DL-050) @decision(DL-052)
  const single = new Map([
    [CLAUDE_RULE_FILE, renderRuleFile("claude-file", RULE_TEXT, version)],
    ...renderPluginFiles(pkg),
  ]);
  for (const [path, content] of single) {
    const full = join(root, path);
    const current = existsSync(full) ? readFileSync(full, "utf8") : undefined;
    if (current === content) continue;
    drift += 1;
    if (check) console.error(`${current === undefined ? "missing" : "changed"}: ${path}`);
    else {
      ctx.fs.mkdir(dirname(full));
      writeFileAtomic(ctx, full, content);
      console.log(`${path}: written`);
    }
  }

  // @decision(DL-048)
  // Everything in the plugin directory is generated: report or remove files nothing renders.
  const pluginDir = join(root, CLAUDE_PLUGIN_DIR);
  const stray = existsSync(pluginDir)
    ? readdirSync(pluginDir, { recursive: true, encoding: "utf8" })
        .map((rel) => `${CLAUDE_PLUGIN_DIR}/${rel.split("\\").join("/")}`)
        .filter((path) => !path.startsWith(`${CLAUDE_PLUGIN_SKILLS}/`) && !single.has(path))
        .filter((path) => !statSync(join(root, path)).isDirectory())
        .sort()
    : [];
  for (const path of stray) {
    drift += 1;
    if (check) console.error(`extra:   ${path}`);
    else {
      ctx.fs.remove(join(root, path));
      console.log(`${path}: removed`);
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
