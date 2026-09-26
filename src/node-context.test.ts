import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DldError, GhCommandError, GitCommandError, ToolNotFoundError } from "./core/errors.ts";
import { nodeGh } from "./node-context.ts";
import { type TempProject, tempProject } from "./test-helpers.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

describe("node context", () => {
  test("git returns stdout", () => {
    project = tempProject();
    expect(project.ctx.git(["rev-parse", "--is-inside-work-tree"]).trim()).toBe("true");
  });

  test("git returns output larger than execFileSync's default 1 MB buffer", () => {
    project = tempProject();
    project.write("big.txt", "x".repeat(3 * 1024 * 1024));
    project.git("add", "big.txt");
    expect(project.ctx.git(["show", ":big.txt"]).length).toBe(3 * 1024 * 1024);
  });

  test("git throws GitCommandError with stderr on a non-zero exit", () => {
    project = tempProject();
    const ctx = project.ctx;
    expect(() => ctx.git(["no-such-subcommand"])).toThrow(GitCommandError);
  });

  test("fs lists directory entries with their kind", () => {
    project = tempProject();
    project.write("d/file.md");
    project.write("d/sub/x.md");
    const entries = project.ctx.fs.readDir(`${project.root}/d`);
    expect(entries.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "file.md", isFile: true, isDirectory: false },
      { name: "sub", isFile: false, isDirectory: true },
    ]);
    expect(project.ctx.fs.isDirectory(`${project.root}/missing`)).toBe(false);
  });

  test("fs failures are reported as DldError naming the path", () => {
    project = tempProject();
    project.write("d/file.md");
    const ctx = project.ctx;
    expect(() => ctx.fs.readFile(`${project?.root}/d`)).toThrow(DldError);
    expect(() => ctx.fs.readDir(`${project?.root}/d/file.md`)).toThrow(/cannot read .*ENOTDIR/);
  });
});

describe("node context writes", () => {
  test("write, link, rename and remove operate on real files", () => {
    project = tempProject();
    const { fs } = project.ctx;
    const dir = `${project.root}/a/b`;
    fs.mkdir(dir);
    fs.writeFile(`${dir}/one`, "1");
    fs.link(`${dir}/one`, `${dir}/two`);
    expect(() => fs.link(`${dir}/one`, `${dir}/two`)).toThrow(/cannot create .*two: EEXIST/);
    fs.rename(`${dir}/two`, `${dir}/three`);
    expect(fs.readFile(`${dir}/three`)).toBe("1");
    fs.remove(`${dir}/three`);
    fs.remove(`${dir}/three`);
    expect(fs.exists(`${dir}/three`)).toBe(false);
  });
});

describe("nodeGh", () => {
  /** A directory holding a fake `gh` script, for use as PATH. */
  function fakeGhPath(script: string): { path: string; cleanup(): void } {
    const dir = mkdtempSync(join(tmpdir(), "dld-gh-"));
    const gh = join(dir, "gh");
    writeFileSync(gh, `#!/bin/sh\n${script}\n`);
    chmodSync(gh, 0o755);
    return { path: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  test("returns stdout and disables prompts", () => {
    const fake = fakeGhPath('echo "$GH_PROMPT_DISABLED $*"');
    try {
      expect(nodeGh(tmpdir(), { PATH: fake.path })(["pr", "list"])).toBe("1 pr list\n");
    } finally {
      fake.cleanup();
    }
  });

  test("throws GhCommandError with stderr on failure or timeout", () => {
    const fake = fakeGhPath('if [ "$1" = slow ]; then exec sleep 5; fi; echo denied >&2; exit 4');
    try {
      const gh = nodeGh(tmpdir(), { PATH: `${fake.path}:${process.env.PATH}` }, 200);
      expect(() => gh(["auth", "status"])).toThrow(
        new GhCommandError(["auth", "status"], "denied"),
      );
      expect(() => gh(["slow"])).toThrow("timed out after 0.2 seconds");
    } finally {
      fake.cleanup();
    }
  });

  test("throws ToolNotFoundError when gh is missing", () => {
    const empty = mkdtempSync(join(tmpdir(), "dld-nogh-"));
    try {
      expect(() => nodeGh(tmpdir(), { PATH: empty })(["--version"])).toThrow(ToolNotFoundError);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  test("fs reads bytes, file modes and changes modes", () => {
    const p = tempProject();
    project = p;
    p.write("x.sh", "é");
    const path = join(p.root, "x.sh");
    const fs = p.ctx.fs;
    expect([...fs.readBytes(path)]).toEqual([0xc3, 0xa9]);
    fs.chmod(path, 0o700);
    expect(fs.fileMode(path)).toBe(0o700);
    expect(() => fs.fileMode(join(p.root, "missing"))).toThrow(DldError);
  });
});
