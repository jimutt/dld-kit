import { afterEach, describe, expect, test } from "bun:test";
import { NAMESPACED_CONFIG, recordText, type TempProject, tempProject } from "../test-helpers.ts";
import { collectIndexRows, renderIndex } from "./index-file.ts";
import { loadProject } from "./project.ts";
import { parseRecord } from "./records.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

const row = (id: string, extra = "") => ({
  number: Number.parseInt(id.slice(3), 10),
  record: parseRecord(recordText(id, "accepted", extra), id),
});

describe("renderIndex", () => {
  test("empty flat index matches create-empty-index.sh", () => {
    expect(renderIndex([], "flat")).toBe(
      "# Decision Log\n\n| ID | Title | Status | Tags |\n|----|-------|--------|------|\n",
    );
  });

  test("namespaced rows include the namespace column, highest ID first", () => {
    expect(
      renderIndex([row("DL-002", "namespace: auth\n"), row("DL-010"), row("DL-009")], "namespaced"),
    ).toBe(`# Decision Log

| ID | Title | Status | Namespace | Tags |
|----|-------|--------|-----------|------|
| DL-010 | Test decision DL-010 | accepted |  | test, example |
| DL-009 | Test decision DL-009 | accepted |  | test, example |
| DL-002 | Test decision DL-002 | accepted | auth | test, example |
`);
  });
});

describe("collectIndexRows", () => {
  test("reads local records, including namespace subdirectories", () => {
    project = tempProject(NAMESPACED_CONFIG);
    project.write("decisions/records/billing/DL-001.md", recordText("DL-001"));
    project.write("decisions/records/auth/DL-002.md", recordText("DL-002"));
    const rows = collectIndexRows(project.ctx, loadProject(project.ctx).paths);
    expect(rows.map((r) => r.record.id).sort()).toEqual(["DL-001", "DL-002"]);
  });

  test("names the file when a record cannot be parsed", () => {
    project = tempProject();
    project.write("decisions/records/DL-001.md", "no frontmatter");
    const ctx = project.ctx;
    expect(() => collectIndexRows(ctx, loadProject(ctx).paths)).toThrow(
      "decisions/records/DL-001.md: no frontmatter",
    );
  });

  test("with a base ref, adds base-only records and prefers local copies", () => {
    project = tempProject();
    project.write("decisions/records/DL-001.md", recordText("DL-001", "proposed"));
    project.write("decisions/records/DL-002.md", recordText("DL-002"));
    project.git("add", ".");
    project.git("commit", "-qm", "base");
    project.git("branch", "base");
    project.write("decisions/records/DL-001.md", recordText("DL-001", "superseded"));
    project.git("rm", "-q", "decisions/records/DL-002.md");
    project.write("decisions/records/DL-003.md", recordText("DL-003"));

    const rows = collectIndexRows(project.ctx, loadProject(project.ctx).paths, "base");
    const byId = Object.fromEntries(rows.map((r) => [r.record.id, r.record.status]));
    expect(byId).toEqual({ "DL-001": "superseded", "DL-002": "accepted", "DL-003": "accepted" });
  });

  test("rejects an unknown base ref", () => {
    project = tempProject();
    project.write("decisions/records/DL-001.md", recordText("DL-001"));
    const ctx = project.ctx;
    expect(() => collectIndexRows(ctx, loadProject(ctx).paths, "no/such/ref")).toThrow(
      "--include-base ref 'no/such/ref' not found.",
    );
  });
});
