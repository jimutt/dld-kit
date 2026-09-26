// Runs each ported command through the dispatcher against a temporary project.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  captureIo,
  NAMESPACED_CONFIG,
  recordText,
  type TempProject,
  tempProject,
} from "../test-helpers.ts";
import { EXIT_OK, EXIT_USAGE } from "./command.ts";
import { run } from "./index.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

function dld(p: TempProject, ...argv: string[]) {
  const io = captureIo();
  return { code: run(argv, io, p.ctx), out: io.out, err: io.err };
}

describe("create-config", () => {
  test("creates a namespaced config and reports the path", () => {
    project = tempProject(null);
    const result = dld(project, "create-config", "namespaced", "billing", "auth");
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toBe(`Created ${join(project.root, "dld.config.yaml")}\n`);
    expect(readFileSync(join(project.root, "dld.config.yaml"), "utf8")).toContain("  - auth\n");
  });

  test("needs a mode and rejects an invalid one", () => {
    project = tempProject(null);
    expect(dld(project, "create-config").code).toBe(EXIT_USAGE);
    expect(dld(project, "create-config", "nested").err).toBe(
      "Error: mode must be 'flat' or 'namespaced', got 'nested'.\n",
    );
  });
});

describe("init commands", () => {
  test("create-directories and create-empty-index set up an empty log", () => {
    project = tempProject(NAMESPACED_CONFIG);
    rmSync(join(project.root, "decisions"), { recursive: true, force: true });
    expect(dld(project, "create-directories").out).toBe("Created decisions directory structure.\n");
    expect(existsSync(join(project.root, "decisions/records/billing/.gitkeep"))).toBe(true);
    const index = join(project.root, "decisions/INDEX.md");
    expect(dld(project, "create-empty-index").out).toBe(`Created ${index}\n`);
    expect(readFileSync(index, "utf8")).toContain("| ID | Title | Status | Namespace | Tags |");
  });
});

describe("create-decision", () => {
  test("reads the body from stdin and prints the new record's path", () => {
    project = tempProject(undefined, { readStdin: () => "## Context\n\nFrom stdin\n" });
    const result = dld(
      project,
      "create-decision",
      "--id",
      "DL-001",
      "--title",
      "T",
      "--tags",
      "a,b",
      "--supersedes",
      "DL-000",
      "--amends",
      "",
      "--body-stdin",
    );
    const path = join(project.root, "decisions/records/DL-001.md");
    expect(result).toEqual({ code: EXIT_OK, out: `${path}\n`, err: "" });
    const text = readFileSync(path, "utf8");
    expect(text).toContain("supersedes: [DL-000]\namends: []\ntags: [a,b]\n");
    expect(text).toEndWith("\nFrom stdin\n");
  });

  test("does not read stdin unless asked", () => {
    project = tempProject(undefined, {
      readStdin: () => {
        throw new Error("stdin read");
      },
    });
    expect(dld(project, "create-decision", "--id", "DL-001", "--title", "T").code).toBe(EXIT_OK);
  });

  test("requires --id and --title", () => {
    project = tempProject();
    expect(dld(project, "create-decision", "--id", "DL-001").err).toBe(
      "Error: --id and --title are required.\n",
    );
  });
});

describe("update-status", () => {
  test("updates a record and reports it", () => {
    project = tempProject();
    project.write("decisions/records/DL-001.md", recordText("DL-001", "proposed"));
    expect(dld(project, "update-status", "DL-001", "accepted").out).toBe(
      "Updated DL-001 status to accepted.\n",
    );
  });

  test("validates its arguments", () => {
    project = tempProject();
    expect(dld(project, "update-status", "DL-001").code).toBe(EXIT_USAGE);
    expect(dld(project, "update-status", "DL-001", "accepted", "x").code).toBe(EXIT_USAGE);
    expect(dld(project, "update-status", "DL-001", "done").err).toBe(
      "Error: invalid status 'done'. Must be: proposed, accepted, deprecated, superseded.\n",
    );
  });
});

describe("regenerate-index", () => {
  test("reports an empty or populated index", () => {
    project = tempProject();
    project.write("decisions/records/.gitkeep");
    expect(dld(project, "regenerate-index").out).toBe("INDEX.md regenerated (empty).\n");
    project.write("decisions/records/DL-001.md", recordText("DL-001"));
    expect(dld(project, "regenerate-index").out).toBe("INDEX.md regenerated.\n");
    expect(readFileSync(join(project.root, "decisions/INDEX.md"), "utf8")).toContain(
      "| DL-001 | Test decision DL-001 | accepted | test, example |",
    );
  });

  test("fails when the records directory is missing", () => {
    project = tempProject();
    expect(dld(project, "regenerate-index").err).toContain("records directory not found");
  });
});

describe("verify-annotations", () => {
  test("exits 0 when every ID is annotated and 1 listing the missing ones", () => {
    project = tempProject();
    project.write("src/a.ts", "// @decision(DL-001)\n");
    expect(dld(project, "verify-annotations", "DL-001").out).toBe(
      "All decisions have code annotations.\n",
    );
    const missing = dld(project, "verify-annotations", "DL-001", "DL-002", "DL-003");
    expect(missing.code).toBe(1);
    expect(missing.out).toBe(
      "MISSING annotations in source code for: DL-002 DL-003\nEvery implemented decision must have at least one @decision(DL-NNN) annotation in the codebase.\n",
    );
  });

  test("needs at least one ID", () => {
    project = tempProject();
    expect(dld(project, "verify-annotations").code).toBe(EXIT_USAGE);
  });
});

describe("audit commands", () => {
  test("find-annotations prints file:line:id and honours annotation_exclude", () => {
    project = tempProject("decisions_dir: decisions\nmode: flat\nannotation_exclude: [docs/**]\n");
    project.write("src/a.ts", "x\n// @decision(DL-001) replaces DL-005\n");
    project.write("docs/example.md", "@decision(DL-002)\n");
    expect(dld(project, "find-annotations")).toEqual({
      code: EXIT_OK,
      out: "src/a.ts:2:DL-001\n",
      err: "",
    });
  });

  test("find-missing-amends lists pairs; --all ignores the audit state", () => {
    project = tempProject();
    project.write("decisions/records/DL-002.md", `${recordText("DL-002")}Changes DL-001.\n`);
    expect(dld(project, "find-missing-amends").out).toBe("DL-002:DL-001\n");
    expect(dld(project, "find-missing-amends", "--all").out).toBe("DL-002:DL-001\n");
  });

  test("update-audit-state reports the time and commit", () => {
    project = tempProject();
    project.write("decisions/records/.gitkeep");
    const head = project.git("rev-parse", "--short", "HEAD").trim();
    expect(dld(project, "update-audit-state").out).toBe(
      `Audit state updated: 2026-01-15T10:00:00Z at ${head}\n`,
    );
  });
});

describe("snapshot commands", () => {
  test("collect, detect and update work together", () => {
    project = tempProject();
    project.write("decisions/records/DL-001.md", recordText("DL-001"));
    project.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    expect(dld(project, "collect-active-decisions").out).toBe(recordText("DL-001"));
    expect(dld(project, "detect-snapshot-changes").out).toBe("mode: full\n");

    project.write("decisions/SNAPSHOT.md");
    project.write("decisions/OVERVIEW.md");
    const head = project.git("rev-parse", "--short", "HEAD").trim();
    expect(dld(project, "update-snapshot-state", "ONBOARDING.md").out).toBe(
      `Snapshot state updated: 2026-01-15T10:00:00Z at ${head} (through DL-001)\n`,
    );
    expect(dld(project, "detect-snapshot-changes").out).toBe(
      "mode: incremental\nnew_decisions: \nmodified_decisions: \ncommit_range: \n",
    );
  });
});
