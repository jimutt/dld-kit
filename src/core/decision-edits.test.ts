import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type BranchedProject,
  branchedProject,
  NAMESPACED_CONFIG,
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

  test("reports a changed id or timestamp", () => {
    const p = branched();
    p.write(DL001, recordText("DL-001").replace("id: DL-001", "id: DL-099"));
    expect(check(p)[0]?.state).toBe("edited");
    p.write(DL001, recordText("DL-001").replace("2026-01-15", "2027-01-15"));
    expect(check(p)[0]?.state).toBe("edited");
    p.write(DL001, "---\nid: [broken\n---\nText\n");
    expect(check(p)[0]?.state).toBe("edited");
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

  test("puts back id and timestamp, keeping other frontmatter", () => {
    const p = branched();
    const edited = recordText("DL-001", "superseded")
      .replace("id: DL-001", "id: DL-099")
      .replace("timestamp: 2026-01-15T10:00:00Z\n", "");
    p.write(DL001, edited);
    restore(p, ["DL-001"]);
    const restored = read(p, DL001);
    expect(restored).toContain("id: DL-001\n");
    expect(restored).toContain("timestamp: 2026-01-15T10:00:00Z\n");
    expect(restored).toContain("status: superseded\n");
    expect(check(p)).toEqual([]);
  });

  test("refuses drafts before writing anything", () => {
    const p = branched();
    p.write(DL001, recordText("DL-001").replace("Test context", "Rewritten"));
    expect(() => restore(p, ["DL-001", "DL-002"])).toThrow(
      "DL-002 is a draft (not on the base branch, or still proposed there).",
    );
    p.onMain("main: proposed DL-003", () =>
      p.write("decisions/records/DL-003.md", recordText("DL-003", "proposed")),
    );
    p.git("merge", "--quiet", "--no-edit", "main");
    expect(() => restore(p, ["DL-003"])).toThrow("DL-003 is a draft");
    expect(read(p, DL001)).toContain("Rewritten");
  });
});

// @decision(DL-066) @decision(DL-068)
describe("uncommitted changes only", () => {
  const options = { uncommitted: true };

  test("ignores committed edits and restores from HEAD", () => {
    const p = branched();
    p.write(DL001, recordText("DL-001").replace("Test context", "Hand-fixed context"));
    p.commitAll("feature: fix DL-001 by hand");
    expect(checkDecisionEdits(p.ctx, loadProject(p.ctx), "main", [], options)).toEqual([]);
    expect(check(p)[0]?.state).toBe("edited");

    p.write(DL001, recordText("DL-001").replace("Test context", "Agent rewrite"));
    expect(checkDecisionEdits(p.ctx, loadProject(p.ctx), "main", [], options)).toEqual([
      { path: DL001, id: "DL-001", state: "edited" },
    ]);
    restoreDecisionProse(p.ctx, loadProject(p.ctx), "main", ["DL-001"], options);
    expect(read(p, DL001)).toContain("Hand-fixed context");
  });

  test("leaves records deleted in a commit alone, and refuses to restore them", () => {
    const p = branched();
    p.git("rm", "--quiet", DL001);
    p.commitAll("feature: drop DL-001");
    expect(checkDecisionEdits(p.ctx, loadProject(p.ctx), "main", ["DL-001"], options)).toEqual([
      { path: DL001, id: "DL-001", state: "integrated" },
    ]);
    expect(() =>
      restoreDecisionProse(p.ctx, loadProject(p.ctx), "main", ["DL-001"], options),
    ).toThrow("DL-001 is not in HEAD; nothing to restore.");
  });
});

describe("edge cases", () => {
  test("follows a record moved to another namespace folder", () => {
    const p = branchedProject(NAMESPACED_CONFIG);
    project = p;
    p.onMain("main: billing DL-005", () =>
      p.write("decisions/records/billing/DL-005.md", recordText("DL-005")),
    );
    p.git("merge", "--quiet", "--no-edit", "main");
    p.git("mv", "decisions/records/billing", "decisions/records/auth");
    const moved = "decisions/records/auth/DL-005.md";
    expect(check(p)).toEqual([]);
    p.write(moved, recordText("DL-005").replace("Test context", "Moved and rewritten"));
    expect(check(p)).toEqual([{ path: moved, id: "DL-005", state: "edited" }]);
    restoreDecisionProse(p.ctx, loadProject(p.ctx), "main", ["DL-005"]);
    expect(read(p, moved)).toBe(recordText("DL-005"));
    expect(existsSync(join(p.root, "decisions/records/billing/DL-005.md"))).toBe(false);
  });

  test("ignores a final newline and keeps CRLF when restoring", () => {
    const p = branched();
    p.write(DL001, `${recordText("DL-001")}\n\n`);
    expect(check(p)).toEqual([]);
    const crlf = recordText("DL-001", "superseded")
      .replace("Test context", "X")
      .replace(/\n/g, "\r\n");
    p.write(DL001, crlf);
    restoreDecisionProse(p.ctx, loadProject(p.ctx), "main", ["DL-001"]);
    expect(read(p, DL001)).toBe(recordText("DL-001", "superseded").replace(/\n/g, "\r\n"));
  });

  test("stages a restored deleted record", () => {
    const p = branched();
    p.git("rm", "--quiet", DL001);
    restoreDecisionProse(p.ctx, loadProject(p.ctx), "main", ["DL-001"]);
    expect(p.git("status", "--porcelain", DL001)).toBe("");
  });
});
