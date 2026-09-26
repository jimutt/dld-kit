// @decision(DL-051)
// Installs this checkout's skills with a pinned `npx skills` into temporary projects and checks
// what arrives. Needs network access for the skills package, and dist/dld.mjs (npm run build).
import { execFileSync, spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SKILLS = "skills@1.7.0";
const repo = resolve(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
const expected = readdirSync(join(repo, "skills")).sort();
const failures = [];
const projects = [];

function check(ok, message) {
  if (!ok) failures.push(message);
}

function project() {
  const dir = mkdtempSync(join(tmpdir(), "dld-installers-"));
  projects.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  return dir;
}

function skillsAdd(dir, ...args) {
  execFileSync("npx", ["--yes", SKILLS, "add", repo, ...args, "--yes"], {
    cwd: dir,
    stdio: ["ignore", "ignore", "inherit"],
  });
}

function node(dir, ...args) {
  return spawnSync("node", args, { cwd: dir, encoding: "utf8" });
}

try {
  // A full install for Claude Code and Codex: .agents/skills holds the copies, .claude/skills links.
  const full = project();
  mkdirSync(join(full, ".claude"));
  skillsAdd(full, "--skill", "*", "--agent", "claude-code", "codex");
  const installed = readdirSync(join(full, ".agents/skills")).sort();
  check(
    JSON.stringify(installed) === JSON.stringify(expected),
    `full install: expected ${expected.join(", ")} in .agents/skills, found ${installed.join(", ")}`,
  );
  for (const skill of installed) {
    const manifest = readFileSync(join(full, ".agents/skills", skill, "SKILL.md"), "utf8");
    const portable = readFileSync(join(repo, "skills", skill, "SKILL.md"), "utf8");
    check(
      manifest === portable,
      `full install: ${skill}/SKILL.md is not the portable skills/ copy`,
    );
    check(
      lstatSync(join(full, ".claude/skills", skill)).isSymbolicLink(),
      `full install: .claude/skills/${skill} is not a symlink`,
    );
  }
  for (const dir of [".agents/skills", ".claude/skills"]) {
    // Not path.join, which would drop the ".." before the OS resolves the symlink.
    const cli = `${dir}/dld-plan/../dld-common/scripts/dld.mjs`;
    const result = node(full, cli, "--version");
    check(
      result.status === 0 && result.stdout.trim() === version,
      `full install: node ${cli} --version printed '${result.stdout.trim()}' (exit ${result.status}), expected ${version}`,
    );
  }

  // dld update refuses to write through the links npx skills made.
  writeFileSync(join(full, "dld.config.yaml"), "decisions_dir: decisions\nmode: flat\n");
  const update = node(full, join(repo, "dist/dld.mjs"), "update", "--agent", "claude");
  check(
    update.status === 1 && update.stderr.includes("so another installer, such as npx skills"),
    `dld update over npx skills: expected the symlink error, got exit ${update.status}: ${update.stderr.trim()}`,
  );

  // A partial install brings only the named skill; dld-common is not a dependency.
  const partial = project();
  skillsAdd(partial, "--skill", "dld-plan", "--agent", "codex");
  const only = readdirSync(join(partial, ".agents/skills")).sort();
  check(
    JSON.stringify(only) === JSON.stringify(["dld-plan"]),
    `partial install: expected only dld-plan, found ${only.join(", ")}`,
  );

  // dld update reads skills-lock.json and warns that npx skills manages the skill.
  writeFileSync(join(partial, "dld.config.yaml"), "decisions_dir: decisions\nmode: flat\n");
  const locked = node(partial, join(repo, "dist/dld.mjs"), "update", "--agent", "codex");
  check(
    locked.status === 0 && locked.stderr.includes("skills-lock.json lists dld-plan"),
    `dld update after a partial install: expected the skills-lock.json warning, got exit ${locked.status}: ${locked.stderr.trim()}`,
  );
} finally {
  for (const dir of projects) rmSync(dir, { recursive: true, force: true });
}

for (const failure of failures) console.error(failure);
if (failures.length > 0) process.exit(1);
console.log(`${SKILLS}: full and partial installs as expected`);
