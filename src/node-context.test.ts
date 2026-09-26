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
