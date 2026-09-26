import { describe, expect, test } from "bun:test";
import { fakeContext, memoryFs } from "../test-helpers.ts";
import { FsError } from "./errors.ts";
import { createFileExclusive, TEMP_PREFIX, writeFileAtomic } from "./files.ts";

function setup(files: Record<string, string> = {}) {
  const fs = memoryFs(files);
  return { fs, ctx: fakeContext({ fs }) };
}

const tempFiles = (files: Record<string, string>) =>
  Object.keys(files).filter((path) => path.includes(TEMP_PREFIX));

describe("writeFileAtomic", () => {
  test("replaces the file and leaves no temp file", () => {
    const { fs, ctx } = setup({ "/d/INDEX.md": "old" });
    writeFileAtomic(ctx, "/d/INDEX.md", "new");
    expect(fs.files["/d/INDEX.md"]).toBe("new");
    expect(tempFiles(fs.files)).toEqual([]);
  });

  test("removes the temp file and keeps the original when the rename fails", () => {
    const { fs, ctx } = setup({ "/d/INDEX.md": "old" });
    fs.rename = (from) => {
      throw new FsError("rename", from, "EACCES");
    };
    expect(() => writeFileAtomic(ctx, "/d/INDEX.md", "new")).toThrow(FsError);
    expect(fs.files["/d/INDEX.md"]).toBe("old");
    expect(tempFiles(fs.files)).toEqual([]);
  });
});

describe("createFileExclusive", () => {
  test("creates a new file and leaves no temp file", () => {
    const { fs, ctx } = setup();
    createFileExclusive(ctx, "/d/new.md", "content", "exists");
    expect(fs.files["/d/new.md"]).toBe("content");
    expect(tempFiles(fs.files)).toEqual([]);
  });

  test("fails with the given message and leaves the existing file alone", () => {
    const { fs, ctx } = setup({ "/d/new.md": "original" });
    expect(() => createFileExclusive(ctx, "/d/new.md", "content", "it exists")).toThrow(
      /^it exists$/,
    );
    expect(fs.files["/d/new.md"]).toBe("original");
    expect(tempFiles(fs.files)).toEqual([]);
  });

  test("passes other failures through", () => {
    const { fs, ctx } = setup();
    fs.writeFile = (path) => {
      throw new FsError("write", path, "ENOSPC");
    };
    expect(() => createFileExclusive(ctx, "/d/new.md", "x", "exists")).toThrow(/ENOSPC/);
  });
});
