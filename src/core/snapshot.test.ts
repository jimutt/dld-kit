import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAMESPACED_CONFIG, recordText, type TempProject, tempProject } from "../test-helpers.ts";
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

  test("is empty with no accepted records", () => {
    project = tempProject();
    project.write("decisions/records/.gitkeep");
    expect(collectActiveDecisions(project.ctx, loadProject(project.ctx))).toBe("");
    writeRecord(project, "DL-001", "proposed");
    expect(collectActiveDecisions(project.ctx, loadProject(project.ctx))).toBe("");
  });

  test("collects accepted records across namespaces in ID order", () => {
    project = tempProject(NAMESPACED_CONFIG);
    project.write("decisions/records/billing/DL-001.md", recordText("DL-001"));
    project.write("decisions/records/auth/DL-002.md", recordText("DL-002", "proposed"));
    project.write("decisions/records/auth/DL-003.md", recordText("DL-003"));
    expect(collectActiveDecisions(project.ctx, loadProject(project.ctx))).toBe(
      `${recordText("DL-001")}===DLD_DECISION_BOUNDARY===\n${recordText("DL-003")}`,
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
    for (const artifact of ["OVERVIEW.md", "SNAPSHOT.md"]) {
      project = tempProject();
      snapshotted(project);
      project.git("rm", "-q", `decisions/${artifact}`);
      expect(detect(project)).toEqual({ mode: "full" });
      project.cleanup();
    }
    project = undefined;
  });

  test("is full when the state file has only an audit section", () => {
    project = tempProject();
    writeRecord(project, "DL-001");
    project.write("decisions/SNAPSHOT.md");
    project.write("decisions/OVERVIEW.md");
    project.write(
      "decisions/.dld-state.yaml",
      "audit:\n  last_run: 2026-01-10T08:00:00Z\n  commit_hash: abc1234\n",
    );
    expect(detect(project)).toEqual({ mode: "full" });
  });

  test("reports new decisions without a commit baseline", () => {
    project = tempProject();
    writeRecord(project, "DL-001");
    project.write("decisions/SNAPSHOT.md");
    project.write("decisions/OVERVIEW.md");
    project.write(
      "decisions/.dld-state.yaml",
      "snapshot:\n  last_run: 2026-01-15T10:00:00Z\n  decisions_included: 1\n  artifacts:\n    SNAPSHOT.md: 2026-01-15T10:00:00Z\n    OVERVIEW.md: 2026-01-15T10:00:00Z\n",
    );
    writeRecord(project, "DL-002");
    const changes = detect(project);
    expect(changes).toMatchObject({ mode: "incremental", newDecisions: ["DL-002"] });
    expect(formatSnapshotChanges(changes)).toContain("new_decisions: DL-002\n");
  });

  test("falls back to an earlier commit at last_run and reports later changes", () => {
    const p = tempProject();
    project = p;
    // Commits dated explicitly, so last_run falls between them.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
    );
    const commitAt = (date: string, message: string) => {
      execFileSync("git", ["add", "-A"], { cwd: p.root, env });
      execFileSync("git", ["commit", "-qm", message], {
        cwd: p.root,
        env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      });
    };
    writeRecord(p, "DL-001");
    writeRecord(p, "DL-002");
    p.write("decisions/SNAPSHOT.md");
    p.write("decisions/OVERVIEW.md");
    commitAt("2026-01-10T10:00:00Z", "snapshot");
    p.write(
      "decisions/.dld-state.yaml",
      "snapshot:\n  last_run: 2026-01-10T12:00:00Z\n  decisions_included: 2\n  artifacts:\n    SNAPSHOT.md: 2026-01-10T12:00:00Z\n    OVERVIEW.md: 2026-01-10T12:00:00Z\n",
    );
    commitAt("2026-01-10T12:00:00Z", "state");
    writeRecord(p, "DL-001", "superseded");
    commitAt("2026-01-11T10:00:00Z", "change");
    const changes = detect(p);
    expect(changes).toMatchObject({ mode: "incremental", modifiedDecisions: ["DL-001"] });
    const stateCommit = p.git("rev-parse", "--short", "HEAD~1").trim();
    expect(changes.mode === "incremental" && changes.commitRange).toBe(`${stateCommit}..HEAD`);
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

  test("treats an unreachable or non-hash commit as no baseline", () => {
    project = tempProject();
    snapshotted(project);
    for (const hash of ["deadbee", "--textconv", "HEAD~0"]) {
      project.write(
        "decisions/.dld-state.yaml",
        `snapshot:\n  commit_hash: "${hash}"\n  decisions_included: 2\n`,
      );
      expect(detect(project)).toMatchObject({ mode: "incremental", commitRange: "" });
    }
  });

  test("detects modified records under non-ASCII paths", () => {
    project = tempProject("decisions_dir: beslut/décisions\nmode: flat\n");
    project.write("beslut/décisions/records/DL-001.md", recordText("DL-001"));
    project.write("beslut/décisions/SNAPSHOT.md");
    project.write("beslut/décisions/OVERVIEW.md");
    project.git("add", ".");
    project.git("commit", "-qm", "snapshot");
    updateSnapshotState(project.ctx, loadProject(project.ctx), []);
    project.write("beslut/décisions/records/DL-001.md", recordText("DL-001", "superseded"));
    project.git("add", ".");
    project.git("commit", "-qm", "change");
    expect(detect(project)).toMatchObject({ modifiedDecisions: ["DL-001"] });
  });
});

describe("updateSnapshotState", () => {
  test("records zero when no decision is accepted", () => {
    project = tempProject();
    writeRecord(project, "DL-001", "proposed");
    const result = updateSnapshotState(project.ctx, loadProject(project.ctx), []);
    expect(result.highest).toBe(0);
    expect(readFileSync(join(project.root, "decisions/.dld-state.yaml"), "utf8")).toContain(
      "  decisions_included: 0\n",
    );
  });

  test("records the highest accepted ID and artifact timestamps", () => {
    project = tempProject();
    writeRecord(project, "DL-001");
    writeRecord(project, "DL-003");
    writeRecord(project, "DL-004", "proposed");
    const result = updateSnapshotState(project.ctx, loadProject(project.ctx), [
      "ONBOARDING.md",
      "__proto__",
    ]);
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
    __proto__: 2026-01-15T10:00:00Z
`,
    );
  });
});
