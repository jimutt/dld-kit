import { afterEach, describe, expect, test } from "bun:test";
import {
  type BranchedProject,
  branchedProject,
  NAMESPACED_CONFIG,
  recordText,
  type TempProject,
  tempProject,
} from "../test-helpers.ts";
import { loadProject } from "./project.ts";
import {
  compareIds,
  findCollisions,
  formatRename,
  listTakenIds,
  planRenames,
  resolveBase,
} from "./reindex.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

function branched(...args: Parameters<typeof branchedProject>): BranchedProject {
  const p = branchedProject(...args);
  project = p;
  return p;
}

const addRecord = (p: TempProject, path: string, id: string) => p.write(path, recordText(id));

describe("resolveBase", () => {
  test("uses an upstream that tracks a differently named branch", () => {
    const p = branched();
    p.git("remote", "add", "origin", "https://example.com/r.git");
    p.git("update-ref", "refs/remotes/origin/develop", "HEAD");
    p.git("config", "branch.feature.remote", "origin");
    p.git("config", "branch.feature.merge", "refs/heads/develop");
    expect(resolveBase(p.ctx)).toBe("origin/develop");
  });

  test("falls back to origin/main without an upstream or when it is the same branch", () => {
    const p = branched();
    expect(resolveBase(p.ctx)).toBe("origin/main");
    p.git("update-ref", "refs/remotes/origin/feature", "HEAD");
    p.git("config", "branch.feature.remote", "origin");
    p.git("config", "branch.feature.merge", "refs/heads/feature");
    expect(resolveBase(p.ctx)).toBe("origin/main");
  });

  test("uses a local upstream branch name without a slash", () => {
    const p = branched();
    p.git("config", "branch.feature.remote", ".");
    p.git("config", "branch.feature.merge", "refs/heads/main");
    expect(resolveBase(p.ctx)).toBe("main");
  });

  test("needs no config and answers outside a repository", () => {
    project = tempProject(null);
    expect(resolveBase({ ...project.ctx, cwd: "/" })).toBe("origin/main");
  });
});

describe("listTakenIds", () => {
  test("lists base-branch IDs by number and fails on an unknown base", () => {
    const p = branched();
    p.onMain("more", () => {
      addRecord(p, "decisions/records/DL-1000.md", "DL-1000");
      addRecord(p, "decisions/records/ns/DL-999.md", "DL-999");
    });
    expect(listTakenIds(p.ctx, loadProject(p.ctx), "main")).toEqual({
      ids: ["DL-001", "DL-999", "DL-1000"],
      skipped: "gh CLI not installed",
    });
    expect(() => listTakenIds(p.ctx, loadProject(p.ctx), "nope")).toThrow(
      "base ref 'nope' not found. Fetch first or pass --base.",
    );
  });

  test("adds IDs from open PRs", () => {
    const p = branched(undefined, {
      gh: (args) =>
        args[0] === "pr"
          ? JSON.stringify([{ headRefName: "x", files: [{ path: "decisions/records/DL-004.md" }] }])
          : "",
    });
    p.git("remote", "add", "origin", "https://github.com/o/r");
    expect(listTakenIds(p.ctx, loadProject(p.ctx), "main")).toEqual({
      ids: ["DL-001", "DL-004"],
    });
  });
});

describe("findCollisions", () => {
  test("reports local additions whose IDs are taken, ignoring other files", () => {
    const p = branched();
    p.onMain("land", () => addRecord(p, "decisions/records/DL-002.md", "DL-002"));
    addRecord(p, "decisions/records/DL-002.md", "DL-002");
    addRecord(p, "decisions/records/DL-003.md", "DL-003");
    p.write("decisions/records/notes.md", "junk");
    p.commitAll("local");
    expect(findCollisions(p.ctx, loadProject(p.ctx), "main")).toEqual({
      collisions: [{ path: "decisions/records/DL-002.md", id: "DL-002" }],
      skipped: "gh CLI not installed",
    });
  });

  test("finds records under non-ASCII paths and skips the PR scan with no additions", () => {
    const p = branched(NAMESPACED_CONFIG);
    expect(findCollisions(p.ctx, loadProject(p.ctx), "main")).toEqual({ collisions: [] });
    p.onMain("land", () => addRecord(p, "decisions/records/billing/DL-002.md", "DL-002"));
    addRecord(p, "decisions/records/fakturor-å/DL-002.md", "DL-002");
    p.commitAll("local");
    expect(findCollisions(p.ctx, loadProject(p.ctx), "main").collisions).toEqual([
      { path: "decisions/records/fakturor-å/DL-002.md", id: "DL-002" },
    ]);
  });

  test("fails on an unknown base", () => {
    const p = branched();
    expect(() => findCollisions(p.ctx, loadProject(p.ctx), "does/not/exist")).toThrow(
      "base ref 'does/not/exist' not found.",
    );
  });
});

describe("planRenames", () => {
  test("assigns consecutive IDs above everything taken or added, in ID order", () => {
    const p = branched();
    p.onMain("land", () => {
      for (const id of ["DL-999", "DL-1000", "DL-007"]) {
        addRecord(p, `decisions/records/${id}.md`, id);
      }
    });
    for (const id of ["DL-1000", "DL-999", "DL-007", "DL-1200"]) {
      addRecord(p, `decisions/records/${id}.md`, id);
    }
    p.commitAll("local");
    const { renames } = planRenames(p.ctx, loadProject(p.ctx), "main");
    expect(renames.map(formatRename)).toEqual([
      "decisions/records/DL-007.md\tDL-007\tDL-1201",
      "decisions/records/DL-999.md\tDL-999\tDL-1202",
      "decisions/records/DL-1000.md\tDL-1000\tDL-1203",
    ]);
  });

  test("is empty without collisions and keeps three-digit IDs", () => {
    const p = branched();
    addRecord(p, "decisions/records/DL-005.md", "DL-005");
    p.commitAll("local");
    expect(planRenames(p.ctx, loadProject(p.ctx), "main").renames).toEqual([]);
    p.onMain("land", () => addRecord(p, "decisions/records/DL-005.md", "DL-005"));
    expect(planRenames(p.ctx, loadProject(p.ctx), "main").renames.map(formatRename)).toEqual([
      "decisions/records/DL-005.md\tDL-005\tDL-006",
    ]);
  });

  test("orders two collisions on the same ID by path", () => {
    const p = branched(NAMESPACED_CONFIG);
    p.onMain("land", () => addRecord(p, "decisions/records/auth/DL-002.md", "DL-002"));
    addRecord(p, "decisions/records/billing/DL-002.md", "DL-002");
    addRecord(p, "decisions/records/auth/DL-002.md", "DL-002");
    p.commitAll("local");
    const { renames } = planRenames(p.ctx, loadProject(p.ctx), "main");
    expect(renames.map((r) => r.path)).toEqual([
      "decisions/records/auth/DL-002.md",
      "decisions/records/billing/DL-002.md",
    ]);
  });
});

test("compareIds orders by number, then text", () => {
  expect(["DL-10", "DL-9", "DL-009", "DL-2"].sort(compareIds)).toEqual([
    "DL-2",
    "DL-009",
    "DL-9",
    "DL-10",
  ]);
  expect(compareIds("DL-1", "DL-1")).toBe(0);
});
