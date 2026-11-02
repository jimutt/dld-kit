import { describe, expect, test } from "bun:test";
import { fakeContext, memoryFs } from "../test-helpers.ts";
import {
  applyIndexMergeAttribute,
  INDEX_MERGE_COMMENT,
  planIndexMergeAttribute,
} from "./gitattributes.ts";

const LINE = "/decisions/INDEX.md merge=union";
const plan = (files: Record<string, string>, index = "decisions/INDEX.md") => {
  const fs = memoryFs(files);
  const ctx = fakeContext({ fs });
  return { fs, ctx, plan: planIndexMergeAttribute(ctx, "/p", index) };
};

// @decision(DL-075)
describe("planIndexMergeAttribute", () => {
  test("creates .gitattributes with the managed line, then has nothing to do", () => {
    const { fs, ctx, plan: first } = plan({});
    expect(first).toEqual({ content: `${INDEX_MERGE_COMMENT}\n${LINE}\n`, warnings: [] });
    expect(applyIndexMergeAttribute(ctx, "/p", first)).toBe(true);
    const second = planIndexMergeAttribute(ctx, "/p", "decisions/INDEX.md");
    expect(second).toEqual({ warnings: [] });
    expect(applyIndexMergeAttribute(ctx, "/p", second)).toBe(false);
    expect(fs.files["/p/.gitattributes"]).toBe(`${INDEX_MERGE_COMMENT}\n${LINE}\n`);
  });

  test("appends after the user's lines, separated by a blank line", () => {
    expect(plan({ "/p/.gitattributes": "*.png binary" }).plan.content).toBe(
      `*.png binary\n\n${INDEX_MERGE_COMMENT}\n${LINE}\n`,
    );
    expect(plan({ "/p/.gitattributes": "*.png binary\n" }).plan.content).toBe(
      `*.png binary\n\n${INDEX_MERGE_COMMENT}\n${LINE}\n`,
    );
  });

  test("leaves a merge setting the user made for the index alone", () => {
    for (const line of [
      "decisions/INDEX.md -merge",
      "/decisions/INDEX.md merge=ours",
      "/decisions/INDEX.md text !merge",
    ]) {
      expect(plan({ "/p/.gitattributes": `${line}\r\n` }).plan).toEqual({ warnings: [] });
    }
    expect(plan({ "/p/.gitattributes": "# /decisions/INDEX.md merge=ours\n" }).plan.content).toBe(
      `# /decisions/INDEX.md merge=ours\n\n${INDEX_MERGE_COMMENT}\n${LINE}\n`,
    );
    expect(plan({ "/p/.gitattributes": "/decisions/INDEX.md text\n" }).plan.content).toContain(
      LINE,
    );
  });

  test("adds the line for a moved decisions directory and warns about the old one", () => {
    const old = `${INDEX_MERGE_COMMENT}\n/docs/decisions/INDEX.md merge=union\n`;
    const { plan: result } = plan({ "/p/.gitattributes": old });
    expect(result.content).toBe(`${old}\n${INDEX_MERGE_COMMENT}\n${LINE}\n`);
    expect(result.warnings).toEqual([
      ".gitattributes still sets a merge driver for /docs/decisions/INDEX.md, an earlier decisions directory. Remove that line if the index is no longer there.",
    ]);
  });

  test("does not edit a .gitattributes that is not a regular file", () => {
    const fs = memoryFs({});
    const linked = fakeContext({
      fs: { ...fs, lexists: () => true, isRegularFile: () => false },
    });
    expect(planIndexMergeAttribute(linked, "/p", "decisions/INDEX.md")).toEqual({
      warnings: [
        `.gitattributes is not a regular file, so dld-kit does not edit it. Add this line to it yourself: ${LINE}`,
      ],
    });
  });
});
