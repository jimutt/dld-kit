import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type TempProject, tempProject } from "../test-helpers.ts";
import { findMissingAmends, updateAuditState } from "./audit.ts";
import { loadProject } from "./project.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

function record(id: string, body: string, declared = { supersedes: "", amends: "" }) {
  return `---
id: ${id}
title: "T"
status: accepted
supersedes: [${declared.supersedes}]
amends: [${declared.amends}]
tags: []
references: []
---

${body}
`;
}

const pairs = (p: TempProject, all = false) =>
  findMissingAmends(p.ctx, loadProject(p.ctx), { all }).map((m) => `${m.source}:${m.referenced}`);

describe("findMissingAmends", () => {
  test("lists undeclared body mentions, sorted, ignoring self and declared IDs", () => {
    project = tempProject();
    project.write(
      "decisions/records/DL-010.md",
      record("DL-010", "Replaces DL-002 and changes DL-009, see DL-010 and DL-012.", {
        supersedes: "DL-002",
        amends: "DL-001",
      }),
    );
    project.write("decisions/records/billing/deep/DL-003.md", record("DL-003", "About DL-001."));
    expect(pairs(project)).toEqual(["DL-003:DL-001", "DL-010:DL-009", "DL-010:DL-012"]);
  });

  test("declared IDs match exactly, not by prefix", () => {
    project = tempProject();
    project.write(
      "decisions/records/DL-020.md",
      record("DL-020", "Uses DL-012.", { supersedes: "", amends: "DL-01" }),
    );
    expect(pairs(project)).toEqual(["DL-020:DL-012"]);
  });

  test("after an audit, only checks records changed since then, unless --all", () => {
    project = tempProject();
    project.write("decisions/records/DL-001.md", record("DL-001", "Mentions DL-009."));
    project.write("decisions/records/DL-002.md", record("DL-002", "Mentions DL-008."));
    project.git("add", ".");
    project.git("commit", "-qm", "records");
    updateAuditState(project.ctx, loadProject(project.ctx));
    expect(pairs(project)).toEqual([]);

    project.write("decisions/records/DL-002.md", record("DL-002", "Mentions DL-007."));
    project.write("decisions/records/DL-003.md", record("DL-003", "Mentions DL-006."));
    expect(pairs(project)).toEqual(["DL-002:DL-007", "DL-003:DL-006"]);
    expect(pairs(project, true)).toEqual(["DL-001:DL-009", "DL-002:DL-007", "DL-003:DL-006"]);
  });

  test("finds changed records under non-ASCII paths", () => {
    project = tempProject("decisions_dir: beslut/décisions\nmode: flat\n");
    project.write("beslut/décisions/records/DL-001.md", record("DL-001", "Mentions DL-009."));
    project.git("add", ".");
    project.git("commit", "-qm", "records");
    updateAuditState(project.ctx, loadProject(project.ctx));
    project.write("beslut/décisions/records/DL-001.md", record("DL-001", "Mentions DL-008."));
    expect(pairs(project)).toEqual(["DL-001:DL-008"]);
  });

  test("checks every record when the audit commit is unknown, unreachable or not a hash", () => {
    project = tempProject();
    project.write("decisions/records/DL-001.md", record("DL-001", "Mentions DL-009."));
    for (const hash of ["unknown", "deadbee", "--output=x", "HEAD"]) {
      project.write("decisions/.dld-state.yaml", `audit:\n  last_run: t\n  commit_hash: ${hash}\n`);
      expect(pairs(project)).toEqual(["DL-001:DL-009"]);
    }
  });
});

describe("updateAuditState", () => {
  test("records the time and short HEAD", () => {
    project = tempProject();
    project.write("decisions/records/.gitkeep");
    const result = updateAuditState(project.ctx, loadProject(project.ctx));
    const head = project.git("rev-parse", "--short", "HEAD").trim();
    expect(result).toEqual({ timestamp: "2026-01-15T10:00:00Z", commit: head });
    expect(readFileSync(join(project.root, "decisions/.dld-state.yaml"), "utf8")).toBe(
      `audit:\n  last_run: 2026-01-15T10:00:00Z\n  commit_hash: ${head}\n`,
    );
  });
});
