import { afterEach, describe, expect, test } from "bun:test";
import {
  type BranchedProject,
  branchedProject,
  NAMESPACED_CONFIG,
  recordText,
} from "../test-helpers.ts";
import { loadProject } from "./project.ts";
import { formatProposed, listProposed } from "./proposed.ts";

let project: BranchedProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

// @decision(DL-076)
describe("listProposed", () => {
  test("marks records added on the branch, committed or not, across namespaces, in ID order", () => {
    const p = branchedProject(NAMESPACED_CONFIG);
    project = p;
    p.onMain("main: proposed DL-009", () =>
      p.write("decisions/records/auth/DL-009.md", recordText("DL-009", "proposed")),
    );
    p.git("merge", "-q", "main");
    p.write("decisions/records/billing/DL-010.md", recordText("DL-010", "proposed"));
    p.commitAll("feature: DL-010");
    p.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    const listed = listProposed(p.ctx, loadProject(p.ctx), "main");
    expect(listed.map(formatProposed)).toEqual([
      "DL-002\tbranch\tTest decision DL-002",
      "DL-009\tbase\tTest decision DL-009",
      "DL-010\tbranch\tTest decision DL-010",
    ]);
    expect(listed[2]?.path).toBe("decisions/records/billing/DL-010.md");
  });

  // @decision(DL-090)
  test("marks every record unknown without a base, and needs no git", () => {
    const p = branchedProject();
    project = p;
    p.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    p.write("decisions/records/DL-003.md", recordText("DL-003"));
    const ctx = {
      ...p.ctx,
      git: () => {
        throw new Error("git was called");
      },
    };
    expect(listProposed(ctx, loadProject(p.ctx), undefined).map(formatProposed)).toEqual([
      "DL-002\tunknown\tTest decision DL-002",
    ]);
  });

  test("fails with a clear message for an unknown base", () => {
    const p = branchedProject();
    project = p;
    expect(() => listProposed(p.ctx, loadProject(p.ctx), "nope")).toThrow(
      "base ref 'nope' not found. Fetch first or pass --base.",
    );
  });
});
