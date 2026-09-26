import { afterEach, describe, expect, test } from "bun:test";
import { DldError, GitCommandError } from "./core/errors.ts";
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
