import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type TempProject, tempProject } from "../test-helpers.ts";
import { loadProject } from "./project.ts";
import { readStateSection, shortHead, stateString, writeStateSection } from "./state.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

const statePath = (p: TempProject) => join(p.root, "decisions/.dld-state.yaml");

describe("state file", () => {
  test("reads sections as strings, keeping leading zeros in hashes", () => {
    project = tempProject();
    project.write(
      "decisions/.dld-state.yaml",
      "audit:\n  last_run: 2026-01-10T12:00:00Z\n  commit_hash: 0123456\nsnapshot:\n  decisions_included: 5\n",
    );
    const { paths } = loadProject(project.ctx);
    const audit = readStateSection(project.ctx, paths, "audit");
    expect(stateString(audit, "commit_hash")).toBe("0123456");
    expect(
      stateString(readStateSection(project.ctx, paths, "snapshot"), "decisions_included"),
    ).toBe("5");
  });

  test("treats a missing file or section as absent", () => {
    project = tempProject();
    const { paths } = loadProject(project.ctx);
    expect(readStateSection(project.ctx, paths, "audit")).toBeUndefined();
    project.write("decisions/.dld-state.yaml", "snapshot:\n  last_run: x\n");
    expect(readStateSection(project.ctx, paths, "audit")).toBeUndefined();
    expect(stateString({ a: "" }, "a")).toBeUndefined();
  });

  test("replaces one section and keeps the others with their comments", () => {
    project = tempProject();
    project.write(
      "decisions/.dld-state.yaml",
      "# state\nsnapshot:\n  decisions_included: 5 # kept\naudit:\n  last_run: old\n  commit_hash: old\n",
    );
    const { paths } = loadProject(project.ctx);
    writeStateSection(project.ctx, paths, "audit", { last_run: "new", commit_hash: "0012345" });
    expect(readFileSync(statePath(project), "utf8")).toBe(
      "# state\nsnapshot:\n  decisions_included: 5 # kept\naudit:\n  last_run: new\n  commit_hash: 0012345\n",
    );
  });

  test("creates the file when missing", () => {
    project = tempProject();
    project.write("decisions/records/.gitkeep");
    const { paths } = loadProject(project.ctx);
    writeStateSection(project.ctx, paths, "audit", { last_run: "t", commit_hash: "unknown" });
    expect(readFileSync(statePath(project), "utf8")).toBe(
      "audit:\n  last_run: t\n  commit_hash: unknown\n",
    );
  });

  test.each([
    ["invalid YAML", "audit: [\n", "not valid YAML"],
    ["a list", "- a\n", "expected a mapping"],
  ])("rejects %s, naming the file", (_name, text, message) => {
    project = tempProject();
    project.write("decisions/.dld-state.yaml", text);
    const ctx = project.ctx;
    expect(() => readStateSection(ctx, loadProject(ctx).paths, "audit")).toThrow(
      `decisions/.dld-state.yaml: ${message}`,
    );
  });
});

describe("shortHead", () => {
  test("returns the short hash, or unknown without commits", () => {
    project = tempProject();
    expect(shortHead(project.ctx, project.root)).toBe(
      project.git("rev-parse", "--short", "HEAD").trim(),
    );
    project.git("checkout", "-q", "--orphan", "empty");
    expect(shortHead(project.ctx, project.root)).toBe("unknown");
  });
});
