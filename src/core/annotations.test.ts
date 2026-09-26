import { afterEach, describe, expect, test } from "bun:test";
import { rmSync, symlinkSync } from "node:fs";
import { type TempProject, tempProject } from "../test-helpers.ts";
import {
  formatAnnotation,
  missingAnnotations,
  type ScanOptions,
  scanAnnotations,
} from "./annotations.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

function setup(files: Record<string, string>, decisionsDir = "decisions") {
  project = tempProject(`decisions_dir: ${decisionsDir}\nmode: flat\n`);
  for (const [path, content] of Object.entries(files)) project.write(path, content);
  const options: ScanOptions = {
    root: project.root,
    decisionsDir: `${project.root}/${decisionsDir}`,
    prefix: "@decision",
  };
  return { ctx: project.ctx, options };
}

describe("scanAnnotations", () => {
  test("finds every annotation with its file and line, tracked or untracked", () => {
    const { ctx, options } = setup({
      "src/a.ts": "x\n// @decision(DL-001) @decision(DL-012)\n",
      "lib/b.py": "# @decision(DL-002)\n",
    });
    project?.git("add", "src/a.ts");
    expect(scanAnnotations(ctx, options)).toEqual([
      { file: "lib/b.py", line: 1, id: "DL-002" },
      { file: "src/a.ts", line: 2, id: "DL-001" },
      { file: "src/a.ts", line: 2, id: "DL-012" },
    ]);
  });

  test("skips excluded directories, gitignored files, lockfiles and binaries", () => {
    const { ctx, options } = setup({
      "node_modules/pkg/index.js": "// @decision(DL-001)",
      "packages/x/dist/out.js": "// @decision(DL-002)",
      "ignored/file.ts": "// @decision(DL-003)",
      ".gitignore": "ignored/\n",
      "yarn.lock": "@decision(DL-004)",
      "image.bin": "\0\0@decision(DL-005)",
      "src/ok.ts": "// @decision(DL-006)",
    });
    expect(scanAnnotations(ctx, options).map((a) => a.id)).toEqual(["DL-006"]);
  });

  test("excludes a nested decisions directory by its full path only", () => {
    const { ctx, options } = setup(
      {
        "docs/decisions/records/DL-001.md": "@decision(DL-001)",
        "src/decisions/x.ts": "// @decision(DL-002)",
      },
      "docs/decisions",
    );
    expect(scanAnnotations(ctx, options).map((a) => a.id)).toEqual(["DL-002"]);
  });

  test("matches the prefix literally", () => {
    const { ctx, options } = setup({ "a.ts": "// @why(DL-001) @whyy(DL-002) x.y(DL-003)" });
    expect(scanAnnotations(ctx, { ...options, prefix: "@why" }).map((a) => a.id)).toEqual([
      "DL-001",
    ]);
    expect(scanAnnotations(ctx, { ...options, prefix: "x.y" }).map((a) => a.id)).toEqual([
      "DL-003",
    ]);
  });

  test("skips symlinks, even to files with annotations", () => {
    const { ctx, options } = setup({ "real.ts": "// @decision(DL-001)" });
    symlinkSync(`${options.root}/real.ts`, `${options.root}/link.ts`);
    expect(scanAnnotations(ctx, options).map((a) => a.file)).toEqual(["real.ts"]);
  });

  test("skips tracked files that were deleted", () => {
    const { ctx, options } = setup({ "gone.ts": "// @decision(DL-001)" });
    project?.git("add", "gone.ts");
    rmSync(`${options.root}/gone.ts`);
    expect(scanAnnotations(ctx, options)).toEqual([]);
  });
});

describe("annotation_exclude", () => {
  test("leaves out paths matching the configured git globs", () => {
    const { ctx, options } = setup({
      "docs/guide.md": "@decision(DL-001)",
      "README.md": "@decision(DL-002)",
      "tests/test_a.bats": "# @decision(DL-003)",
      "tests/cli/a.test.ts": "// @decision(DL-004)",
      "src/notes.md": "@decision(DL-005)",
    });
    const ids = scanAnnotations(ctx, {
      ...options,
      exclude: ["docs/**", "*.md", "tests/**/*.bats"],
    }).map((a) => a.id);
    // `*.md` matches only at the top level under git's glob rules.
    expect(ids).toEqual(["DL-005", "DL-004"]);
  });
});

describe("formatAnnotation", () => {
  test("prints file:line:id", () => {
    expect(formatAnnotation({ file: "src/a.ts", line: 3, id: "DL-001" })).toBe("src/a.ts:3:DL-001");
  });
});

describe("missingAnnotations", () => {
  test("returns the IDs without annotations, in the given order", () => {
    const { ctx, options } = setup({ "a.ts": "// @decision(DL-002)" });
    expect(missingAnnotations(ctx, options, ["DL-003", "DL-002", "DL-001"])).toEqual([
      "DL-003",
      "DL-001",
    ]);
  });
});
