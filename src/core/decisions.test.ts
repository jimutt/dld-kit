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

  // @decision(DL-080)
  test("fails when the ID is in more than one file", () => {
    project = tempProject(NAMESPACED_CONFIG);
    project.write("decisions/records/auth/DL-002.md", recordText("DL-002"));
    project.write("decisions/records/billing/DL-002.md", recordText("DL-002"));
    const ctx = project.ctx;
    expect(() => updateStatus(ctx, loadProject(ctx), "DL-002", "accepted")).toThrow(
      "decision DL-002 is in more than one file:",
    );
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

  test("uses the namespace directory in namespaced mode, or the root without one", () => {
    project = tempProject(NAMESPACED_CONFIG);
    const namespaced = createDecision(project.ctx, loadProject(project.ctx), {
      ...input,
      namespace: "billing",
    });
    expect(namespaced).toBe(join(project.root, "decisions/records/billing/DL-004.md"));
    const root = createDecision(project.ctx, loadProject(project.ctx), { ...input, id: "DL-005" });
    expect(root).toBe(join(project.root, "decisions/records/DL-005.md"));
    expect(readFileSync(root, "utf8")).not.toContain("namespace:");
  });

  // @decision(DL-080)
  test("rejects a namespace in a flat project", () => {
    project = tempProject();
    const ctx = project.ctx;
    expect(() => createDecision(ctx, loadProject(ctx), { ...input, namespace: "billing" })).toThrow(
      "--namespace is only valid in a namespaced project.",
    );
  });

  test("rejects an ID that exists in any namespace, or with another spelling", () => {
    project = tempProject(NAMESPACED_CONFIG);
    project.write("decisions/records/auth/DL-004.md", recordText("DL-004"));
    project.write("decisions/records/DL-07.md", recordText("DL-07"));
    const ctx = project.ctx;
    for (const [id, namespace, existing] of [
      ["DL-004", "billing", "decisions/records/auth/DL-004.md"],
      ["DL-004", undefined, "decisions/records/auth/DL-004.md"],
      ["DL-007", "auth", "decisions/records/DL-07.md"],
    ]) {
      const override = { id: id ?? "", ...(namespace === undefined ? {} : { namespace }) };
      expect(() => createDecision(ctx, loadProject(ctx), { ...input, ...override })).toThrow(
        `decision ${id} already exists: ${existing}`,
      );
    }
  });

  test("writes the namespace into the frontmatter in namespaced mode", () => {
    project = tempProject(NAMESPACED_CONFIG);
    const path = createDecision(project.ctx, loadProject(project.ctx), {
      ...input,
      namespace: "auth",
    });
    expect(path).toBe(join(project.root, "decisions/records/auth/DL-004.md"));
    expect(readFileSync(path, "utf8")).toContain("amends: []\nnamespace: auth\ntags: []\n");
  });

  test("refuses to overwrite an existing record", () => {
    project = tempProject();
    const ctx = project.ctx;
    createDecision(ctx, loadProject(ctx), input);
    expect(() => createDecision(ctx, loadProject(ctx), input)).toThrow(
      "decision DL-004 already exists: decisions/records/DL-004.md",
    );
  });

  test.each([
    ["an ID that is not DL-<digits>", { id: "../../x" }, "invalid decision ID '../../x'"],
    ["an unpadded ID", { id: "DL-5" }, "decision ID 'DL-5' is not canonical; use DL-005."],
    ["an over-padded ID", { id: "DL-0042" }, "decision ID 'DL-0042' is not canonical; use DL-042."],
    ["a lower-case ID", { id: "dl-007" }, "decision ID 'dl-007' is not canonical; use DL-007."],
    ["an ID too long to respell", { id: "DL-099999999999999999999" }, "invalid decision ID"],
    [
      "a namespace that leaves the records directory",
      { namespace: ".." },
      "unknown namespace '..'; configured namespaces: billing, auth.",
    ],
    ["a namespace with a separator", { namespace: "a/b" }, "unknown namespace 'a/b'"],
    ["a namespace that is not configured", { namespace: "nope" }, "unknown namespace 'nope'"],
  ])("rejects %s with a usage error", (_name, override, message) => {
    project = tempProject(NAMESPACED_CONFIG);
    const ctx = project.ctx;
    let error: unknown;
    try {
      createDecision(ctx, loadProject(ctx), { ...input, ...override });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ exitCode: 2 });
    expect(String(error)).toContain(message);
  });

  test("accepts IDs past DL-999", () => {
    project = tempProject();
    const path = createDecision(project.ctx, loadProject(project.ctx), { ...input, id: "DL-1000" });
    expect(path).toBe(join(project.root, "decisions/records/DL-1000.md"));
  });
});
