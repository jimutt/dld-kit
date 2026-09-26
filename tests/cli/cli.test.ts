// @decision(DL-004)
// Runs the built bundle under node; build first with `npm run build`.
import { afterAll, describe, expect, test } from "bun:test";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { version } from "../../package.json";

const BIN = resolve(import.meta.dirname, "../../dist/dld.mjs");

const WORKDIR = realpathSync(mkdtempSync(join(tmpdir(), "dld-cli-")));
afterAll(() => rmSync(WORKDIR, { recursive: true, force: true }));

function dld(...args: string[]) {
  return dldIn(WORKDIR, ...args);
}

function dldIn(cwd: string, ...args: string[]) {
  return dldWithInput(cwd, "", ...args);
}

function dldWithInput(cwd: string, input: string, ...args: string[]) {
  const result = spawnSync("node", [BIN, ...args], { cwd, input, encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}

describe("dld (built, under node)", () => {
  test("--version matches package.json", () => {
    const result = dld("--version");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${version}\n`);
  });

  test("--help prints usage", () => {
    const result = dld("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: dld");
  });

  test("unknown command exits 2 with a message on stderr", () => {
    const result = dld("frobnicate");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown command or option 'frobnicate'");
  });
});

describe("next-id (built, under node)", () => {
  const project = join(WORKDIR, "project");
  mkdirSync(join(project, "decisions/records/billing"), { recursive: true });
  execFileSync("git", ["init", "--quiet"], { cwd: project });
  writeFileSync(join(project, "dld.config.yaml"), "decisions_dir: decisions\nmode: flat\n");
  writeFileSync(join(project, "decisions/records/billing/DL-009.md"), "");

  test("prints the next ID from a subdirectory of the project", () => {
    const result = dldIn(join(project, "decisions"), "next-id");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("DL-010\n");
  });

  test("create-decision reads the body from standard input", () => {
    const result = dldWithInput(
      project,
      "## Context\n\nPiped body\n",
      "create-decision",
      "--id",
      "DL-010",
      "--title",
      "Piped",
      "--body-stdin",
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const path = join(project, "decisions/records/DL-010.md");
    expect(result.stdout).toBe(`${path}\n`);
    expect(readFileSync(path, "utf8")).toEndWith("---\n\n## Context\n\nPiped body\n");
  });

  test("fails without stdout when the config is missing", () => {
    const bare = join(WORKDIR, "bare");
    mkdirSync(bare);
    execFileSync("git", ["init", "--quiet"], { cwd: bare });
    const result = dldIn(bare, "next-id");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Error: dld.config.yaml not found. Run /dld-init first.\n");
  });

  test("fails outside a git repository", () => {
    const result = dld("next-id");
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("Error: not a git repository\n");
  });
});

describe("list-taken-ids with gh (built, under node)", () => {
  test("adds IDs from open PRs reported by gh on PATH", () => {
    const project = join(WORKDIR, "gh-project");
    mkdirSync(join(project, "decisions/records"), { recursive: true });
    writeFileSync(join(project, "dld.config.yaml"), "decisions_dir: decisions\nmode: flat\n");
    writeFileSync(join(project, "decisions/records/DL-001.md"), "");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: project });
    git("init", "--quiet", "-b", "main");
    git("remote", "add", "origin", "git@github.com:o/r.git");
    git("add", ".");
    git("-c", "user.name=T", "-c", "user.email=t@t", "commit", "--quiet", "-m", "seed");

    const bin = join(WORKDIR, "gh-bin");
    mkdirSync(bin);
    const prs = JSON.stringify([
      { headRefName: "x", files: [{ path: "decisions/records/DL-004.md" }] },
    ]);
    writeFileSync(join(bin, "gh"), `#!/bin/sh\n[ "$1" = pr ] && echo '${prs}'\nexit 0\n`);
    chmodSync(join(bin, "gh"), 0o755);

    const result = spawnSync("node", [BIN, "list-taken-ids", "--base", "main"], {
      cwd: project,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("DL-001\nDL-004\n");
  });
});

describe("output to a closed pipe", () => {
  test("exits quietly instead of crashing on EPIPE", async () => {
    const child = spawn("node", [BIN, "--help"], {
      cwd: WORKDIR,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.destroy();
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const code = await new Promise((resolve) => child.on("close", resolve));
    expect(stderr).toBe("");
    expect(code).toBe(0);
  });
});
