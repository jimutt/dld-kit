// @decision(DL-002) @decision(DL-005) @decision(DL-034) @decision(DL-042)
// Fails if the npm tarball is missing the CLI or contains anything outside the allowlist.
import { execFileSync } from "node:child_process";

const REQUIRED = [
  "dist/dld.mjs",
  "package.json",
  "templates/rules/dld-workflow.md",
  "templates/skills/dld-init/SKILL.md",
];
const ALLOWED_FILES = new Set(["dist/dld.mjs", "package.json", "README.md", "LICENSE"]);
const ALLOWED_DIRS = ["skills/", "templates/skills/", "templates/rules/"];

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
const [pack] = JSON.parse(output);
if (!Array.isArray(pack?.files)) throw new Error("unexpected `npm pack --json` output");
const paths = pack.files.map((f) => f.path);

const missing = REQUIRED.filter((p) => !paths.includes(p));
const unexpected = paths.filter(
  (p) => !ALLOWED_FILES.has(p) && !ALLOWED_DIRS.some((dir) => p.startsWith(dir)),
);

for (const p of missing) console.error(`missing from package: ${p}`);
for (const p of unexpected) console.error(`unexpected in package: ${p}`);

if (missing.length > 0 || unexpected.length > 0) process.exit(1);

console.log(`package ok: ${paths.length} files, ${pack.size} bytes packed`);
