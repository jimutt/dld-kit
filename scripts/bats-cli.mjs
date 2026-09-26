// @decision(DL-013)
// Runs the bats suite against the built CLI: builds a shim copy of skills/ in which
// every script listed in tests/cli-ported.txt runs `node dist/dld.mjs <command>`,
// and every other file is a symlink to the original.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const bin = join(repo, "dist/dld.mjs");
const skills = join(repo, "skills");

if (!existsSync(bin)) fail("dist/dld.mjs not found; run npm run build first");

const ported = new Set(
  readFileSync(join(repo, "tests/cli-ported.txt"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#")),
);

for (const command of ported) {
  const help = spawnSync(process.execPath, [bin, command, "--help"], { encoding: "utf8" });
  if (help.status !== 0)
    fail(`tests/cli-ported.txt lists '${command}', which is not a dld command`);
}

const shim = mkdtempSync(join(tmpdir(), "dld-bats-shim-"));
const shimmed = new Set();

function mirror(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const source = join(dir, entry.name);
    const target = join(shim, relative(skills, source));
    if (entry.isDirectory()) {
      mkdirSync(target, { recursive: true });
      mirror(source);
      continue;
    }
    const command = entry.name.replace(/\.sh$/, "");
    if (
      basename(dirname(source)) === "scripts" &&
      entry.name.endsWith(".sh") &&
      ported.has(command)
    ) {
      writeFileSync(
        target,
        `#!/usr/bin/env bash\nexec ${quote(process.execPath)} ${quote(bin)} ${command} "$@"\n`,
        {
          mode: 0o755,
        },
      );
      shimmed.add(command);
    } else {
      symlinkSync(source, target);
    }
  }
}

let status = 1;
try {
  mirror(skills);
  const missing = [...ported].filter((command) => !shimmed.has(command));
  if (missing.length > 0) {
    throw new Error(`no script found under skills/ for: ${missing.join(", ")}`);
  }

  const result = spawnSync(join(repo, "tests/run.sh"), process.argv.slice(2), {
    stdio: "inherit",
    env: { ...process.env, DLD_BATS_TARGET: "cli", DLD_BATS_SHIM_DIR: shim },
  });
  status = result.status ?? 1;
} catch (error) {
  console.error(`bats-cli: ${error instanceof Error ? error.message : error}`);
} finally {
  rmSync(shim, { recursive: true, force: true });
}
process.exit(status);

function quote(path) {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

function fail(message) {
  console.error(`bats-cli: ${message}`);
  process.exit(1);
}
