import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAMESPACED_CONFIG, recordText, type TempProject, tempProject } from "../test-helpers.ts";
import { createDecision, updateStatus } from "./decisions.ts";
import { loadProject } from "./project.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

const input = { id: "DL-004", title: "Use X", tags: "", supersedes: "", amends: "", body: "Body" };

describe("updateStatus", () => {
  test("rewrites the status of a record in a namespace directory", () => {
    project = tempProject(NAMESPACED_CONFIG);
    project.write("decisions/records/auth/DL-002.md", recordText("DL-002", "proposed"));
    const path = updateStatus(project.ctx, loadProject(project.ctx), "DL-002", "accepted");
    expect(path).toBe(join(project.root, "decisions/records/auth/DL-002.md"));
    expect(readFileSync(path, "utf8")).toBe(recordText("DL-002", "accepted"));
  });

  test("fails for an unknown decision", () => {
    project = tempProject();
    const ctx = project.ctx;
    expect(() => updateStatus(ctx, loadProject(ctx), "DL-009", "accepted")).toThrow(
      "decision DL-009 not found.",
    );
  });
});

describe("createDecision", () => {
  test("writes a proposed record with the clock's timestamp", () => {
    project = tempProject();
    const path = createDecision(project.ctx, loadProject(project.ctx), input);
    expect(path).toBe(join(project.root, "decisions/records/DL-004.md"));
    const text = readFileSync(path, "utf8");
    expect(text).toContain("timestamp: 2026-01-15T10:00:00Z\nstatus: proposed\n");
    expect(text).toEndWith("---\n\nBody\n");
  });

  test("uses the namespace directory in namespaced mode and ignores it in flat mode", () => {
    project = tempProject(NAMESPACED_CONFIG);
    const namespaced = createDecision(project.ctx, loadProject(project.ctx), {
      ...input,
      namespace: "billing",
    });
    expect(namespaced).toBe(join(project.root, "decisions/records/billing/DL-004.md"));
    project.cleanup();

    project = tempProject();
    const flat = createDecision(project.ctx, loadProject(project.ctx), {
      ...input,
      namespace: "billing",
    });
    expect(flat).toBe(join(project.root, "decisions/records/DL-004.md"));
    expect(readFileSync(flat, "utf8")).not.toContain("namespace:");
  });

  test("refuses to overwrite an existing record", () => {
    project = tempProject();
    const ctx = project.ctx;
    createDecision(ctx, loadProject(ctx), input);
    expect(() => createDecision(ctx, loadProject(ctx), input)).toThrow(
      /DL-004\.md already exists\.$/,
    );
  });

  test.each([
    ["an ID that is not DL-<digits>", { id: "../../x" }, "invalid decision ID '../../x'"],
    [
      "a namespace that leaves the records directory",
      { namespace: ".." },
      "invalid namespace '..'",
    ],
    ["a namespace with a separator", { namespace: "a/b" }, "invalid namespace 'a/b'"],
    ["a namespace that is not a plain name", { namespace: "a: b" }, "invalid namespace 'a: b'"],
  ])("rejects %s", (_name, override, message) => {
    project = tempProject(NAMESPACED_CONFIG);
    const ctx = project.ctx;
    expect(() => createDecision(ctx, loadProject(ctx), { ...input, ...override })).toThrow(message);
  });
});
