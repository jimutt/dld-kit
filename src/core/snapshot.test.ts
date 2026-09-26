import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recordText, type TempProject, tempProject } from "../test-helpers.ts";
import { loadProject } from "./project.ts";
import {
  collectActiveDecisions,
  detectSnapshotChanges,
  formatSnapshotChanges,
  updateSnapshotState,
} from "./snapshot.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

const writeRecord = (p: TempProject, id: string, status = "accepted") =>
  p.write(`decisions/records/${id}.md`, recordText(id, status));

describe("collectActiveDecisions", () => {
  test("joins accepted records in ID order with boundary lines", () => {
    project = tempProject();
    writeRecord(project, "DL-010");
    writeRecord(project, "DL-002");
    writeRecord(project, "DL-003", "proposed");
    expect(collectActiveDecisions(project.ctx, loadProject(project.ctx))).toBe(
      `${recordText("DL-002")}===DLD_DECISION_BOUNDARY===\n${recordText("DL-010")}`,
    );
  });

  test("fails without a records directory", () => {
    project = tempProject();
    const ctx = project.ctx;
    expect(() => collectActiveDecisions(ctx, loadProject(ctx))).toThrow(
      "records directory not found",
    );
  });
});

describe("detectSnapshotChanges", () => {
  function snapshotted(p: TempProject) {
    writeRecord(p, "DL-001");
    writeRecord(p, "DL-002");
    p.write("decisions/SNAPSHOT.md");
    p.write("decisions/OVERVIEW.md");
    p.git("add", ".");
    p.git("commit", "-qm", "snapshot");
    updateSnapshotState(p.ctx, loadProject(p.ctx), []);
  }
  const detect = (p: TempProject) => detectSnapshotChanges(p.ctx, loadProject(p.ctx));

  test("is full without state, without artifacts, or without decisions_included", () => {
    project = tempProject();
    writeRecord(project, "DL-001");
    expect(detect(project)).toEqual({ mode: "full" });
    snapshotted(project);
    project.write("decisions/.dld-state.yaml", "snapshot:\n  last_run: t\n");
    expect(detect(project)).toEqual({ mode: "full" });
  });

  test("is full when an artifact is missing", () => {
    project = tempProject();
    snapshotted(project);
    project.git("rm", "-q", "decisions/OVERVIEW.md");
    expect(detect(project)).toEqual({ mode: "full" });
  });

  test("reports new accepted and modified earlier decisions in ascending order", () => {
    project = tempProject();
    snapshotted(project);
    expect(formatSnapshotChanges(detect(project))).toBe(
      "mode: incremental\nnew_decisions: \nmodified_decisions: \ncommit_range: \n",
    );
    writeRecord(project, "DL-002", "superseded");
    writeRecord(project, "DL-001", "deprecated");
    writeRecord(project, "DL-011");
    writeRecord(project, "DL-004");
    writeRecord(project, "DL-005", "proposed");
    project.git("add", ".");
    project.git("commit", "-qm", "changes");
    const changes = detect(project);
    expect(changes).toMatchObject({
      mode: "incremental",
      newDecisions: ["DL-004", "DL-011"],
      modifiedDecisions: ["DL-001", "DL-002"],
    });
    expect(formatSnapshotChanges(changes)).toMatch(
      /^mode: incremental\nnew_decisions: DL-004, DL-011\nmodified_decisions: DL-001, DL-002\ncommit_range: [0-9a-f]+\.\.HEAD\n$/,
    );
  });

  test("falls back to the commit at last_run when commit_hash is missing", () => {
    project = tempProject();
    snapshotted(project);
    const state = readFileSync(join(project.root, "decisions/.dld-state.yaml"), "utf8");
    project.write(
      "decisions/.dld-state.yaml",
      state
        .replace(/ {2}commit_hash: .*\n/, "")
        .replace(/last_run: .*/, "last_run: 2999-01-01T00:00:00Z"),
    );
    writeRecord(project, "DL-001", "superseded");
    project.git("add", ".");
    project.git("commit", "-qm", "change");
    // The latest commit before 2999 is HEAD itself, so nothing is reported as modified.
    expect(detect(project)).toMatchObject({ modifiedDecisions: [], commitRange: "" });
  });

  test("treats an unknown or unreachable commit as no baseline", () => {
    project = tempProject();
    snapshotted(project);
    project.write(
      "decisions/.dld-state.yaml",
      "snapshot:\n  commit_hash: deadbee\n  decisions_included: 2\n",
    );
    expect(detect(project)).toMatchObject({ mode: "incremental", commitRange: "" });
  });
});

describe("updateSnapshotState", () => {
  test("records the highest accepted ID and artifact timestamps", () => {
    project = tempProject();
    writeRecord(project, "DL-001");
    writeRecord(project, "DL-003");
    writeRecord(project, "DL-004", "proposed");
    const result = updateSnapshotState(project.ctx, loadProject(project.ctx), ["ONBOARDING.md"]);
    expect(result.highest).toBe(3);
    const head = project.git("rev-parse", "--short", "HEAD").trim();
    expect(readFileSync(join(project.root, "decisions/.dld-state.yaml"), "utf8")).toBe(
      `snapshot:
  last_run: 2026-01-15T10:00:00Z
  commit_hash: ${head}
  decisions_included: 3
  artifacts:
    SNAPSHOT.md: 2026-01-15T10:00:00Z
    OVERVIEW.md: 2026-01-15T10:00:00Z
    ONBOARDING.md: 2026-01-15T10:00:00Z
`,
    );
  });
});
