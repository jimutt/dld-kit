import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type BranchedProject,
  branchedProject,
  recordText,
  type TempProject,
} from "../test-helpers.ts";
import {
  checkDecisionEdits,
  editBase,
  formatRecordEdit,
  restoreDecisionProse,
} from "./decision-edits.ts";
import { loadProject } from "./project.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

/** main holds DL-001; branch `feature` adds DL-002 (accepted, so a draft by location only). */
function branched(): BranchedProject {
  const p = branchedProject();
  project = p;
  p.write("decisions/records/DL-002.md", recordText("DL-002"));
  p.commitAll("feature: DL-002");
  return p;
}

const DL001 = "decisions/records/DL-001.md";
const read = (p: TempProject, path: string) => readFileSync(join(p.root, path), "utf8");
const check = (p: TempProject, ids: string[] = []) =>
  checkDecisionEdits(p.ctx, loadProject(p.ctx), "main", ids);

// @decision(DL-066)
describe("checkDecisionEdits", () => {
  test("reports nothing for drafts or frontmatter-only changes, whatever the status", () => {
    const p = branched();
    p.write("decisions/records/DL-002.md", `${recordText("DL-002")}\nReworded.\n`);
    p.write(
      DL001,
      recordText("DL-001", "superseded", "title-note: x\n")
        .replace('title: "Test decision DL-001"', 'title: "Renamed"')
        .replace("amends: []", "amends: [DL-002]"),
    );
    expect(check(p)).toEqual([]);
    expect(check(p, ["DL-001", "DL-002"]).map(formatRecordEdit)).toEqual([
      `${DL001}\tDL-001\tintegrated`,
      "decisions/records/DL-002.md\tDL-002\tdraft",
    ]);
  });

  test("reports body edits, committed or not, and ignores line endings", () => {
    const p = branched();
    p.write(DL001, recordText("DL-001").replace(/\n/g, "\r\n"));
    expect(check(p)).toEqual([]);
    p.write(DL001, recordText("DL-001").replace("Test context", "Better context"));
    const edited = [{ path: DL001, id: "DL-001", state: "edited" as const }];
    expect(check(p)).toEqual(edited);
    p.commitAll("feature: reword DL-001");
    expect(check(p)).toEqual(edited);
    expect(check(p, ["DL-001"])).toEqual(edited);
  });

  test("reports deleted records", () => {
    const p = branched();
    p.git("rm", "--quiet", DL001);
    expect(check(p)).toEqual([{ path: DL001, id: "DL-001", state: "deleted" }]);
  });

  test("compares with the merge-base, so later edits on the base don't count", () => {
    const p = branched();
    p.onMain("main: reword DL-001", () =>
      p.write(DL001, recordText("DL-001").replace("Test context", "Main's context")),
    );
    expect(check(p)).toEqual([]);
    p.onMain("main: DL-003", () => p.write("decisions/records/DL-003.md", recordText("DL-003")));
    p.git("merge", "--quiet", "--no-edit", "main");
    expect(check(p, ["DL-003"])[0]?.state).toBe("integrated");
  });

  test("treats a record that was proposed on the base as a draft", () => {
    const p = branched();
    p.onMain("main: proposed DL-003", () =>
      p.write("decisions/records/DL-003.md", recordText("DL-003", "proposed")),
    );
    p.git("merge", "--quiet", "--no-edit", "main");
    p.write("decisions/records/DL-003.md", `${recordText("DL-003")}\nRefined.\n`);
    expect(check(p)).toEqual([]);
    expect(check(p, ["DL-003"])[0]?.state).toBe("draft");
  });

  test("fails on an unknown ID", () => {
    const p = branched();
    expect(() => check(p, ["DL-009"])).toThrow("decision DL-009 not found.");
  });
});

describe("editBase", () => {
  test("uses the given base, else resolve-base, else its local branch", () => {
    const p = branched();
    const paths = loadProject(p.ctx).paths;
    expect(editBase(p.ctx, paths, "main")).toBe("main");
    expect(() => editBase(p.ctx, paths, "nope")).toThrow("base ref 'nope' not found.");
    expect(editBase(p.ctx, paths)).toBe("main");
    p.git("update-ref", "refs/remotes/origin/main", "main");
    expect(editBase(p.ctx, paths)).toBe("origin/main");
    p.git("update-ref", "-d", "refs/remotes/origin/main");
    p.git("branch", "-m", "main", "trunk");
    expect(() => editBase(p.ctx, paths)).toThrow(
      "base ref 'origin/main' not found. Fetch first or pass --base.",
    );
  });
});

// @decision(DL-068)
describe("restoreDecisionProse", () => {
  const restore = (p: TempProject, ids: string[]) =>
    restoreDecisionProse(p.ctx, loadProject(p.ctx), "main", ids);

  test("restores the body and keeps the frontmatter, or the whole deleted file", () => {
    const p = branched();
    const edited = recordText("DL-001", "superseded").replace("Test context", "Rewritten");
    p.write(DL001, edited);
    expect(restore(p, ["DL-001"])).toEqual([DL001]);
    expect(read(p, DL001)).toBe(recordText("DL-001", "superseded"));
    expect(check(p)).toEqual([]);
    p.git("rm", "--quiet", "--force", DL001);
    restore(p, ["DL-001"]);
    expect(read(p, DL001)).toBe(recordText("DL-001"));
  });

  test("refuses drafts before writing anything", () => {
    const p = branched();
    p.write(DL001, recordText("DL-001").replace("Test context", "Rewritten"));
    expect(() => restore(p, ["DL-001", "DL-002"])).toThrow(
      "DL-002 is not on the base branch; it is a draft.",
    );
    expect(read(p, DL001)).toContain("Rewritten");
  });
});
