import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  type BranchedProject,
  branchedProject,
  recordText,
  type TempProject,
} from "../test-helpers.ts";
import { commitReindex, reindexMessage } from "./commit-reindex.ts";
import type { Context } from "./context.ts";
import { GitCommandError } from "./errors.ts";
import { loadProject } from "./project.ts";
import { formatRename, planRenames } from "./reindex.ts";
import { renameDecision } from "./rename.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

/** A branch whose DL-002 collides with main's, renamed per the plan; returns the plan text. */
function collided(): { p: BranchedProject; plan: string } {
  const p = branchedProject();
  project = p;
  p.onMain("land DL-002", () => p.write("decisions/records/DL-002.md", recordText("DL-002")));
  p.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
  p.write("decisions/INDEX.md", "# Decision Log\n| DL-002 |\n");
  p.commitAll("feature: draft DL-002");
  p.write("src/a.py", "# @decision(DL-002)\n");
  p.commitAll("feature: annotate");
  const renames = planRenames(p.ctx, loadProject(p.ctx), "main").renames;
  for (const rename of renames) renameDecision(p.ctx, loadProject(p.ctx), rename, "main");
  return { p, plan: renames.map(formatRename).join("\n") };
}

const squash = (p: TempProject, plan: string, ctx: Context = p.ctx) =>
  commitReindex(ctx, loadProject(ctx), plan, "main");

/** HEAD, the index tree and INDEX.md, to compare before and after a failed run. */
function state(p: TempProject) {
  const index = join(p.root, "decisions/INDEX.md");
  return {
    head: p.git("rev-parse", "HEAD"),
    tree: p.git("write-tree"),
    index: existsSync(index) ? readFileSync(index, "utf8") : undefined,
  };
}

/** The project's context with git failing on the first call whose arguments include `match`. */
function failingGit(p: TempProject, match: string, once = true): Context {
  let failed = false;
  return {
    ...p.ctx,
    git: (args) => {
      if (args.includes(match) && !(once && failed)) {
        failed = true;
        throw new GitCommandError(args, `injected ${match} failure`);
      }
      return p.ctx.git(args);
    },
  };
}

describe("commitReindex", () => {
  test("squashes the branch into one commit without INDEX.md or untracked files", () => {
    const { p, plan } = collided();
    p.write("stray.txt", "stray");
    const result = squash(p, plan);

    const mergeBase = p.git("merge-base", "main", "HEAD").trim();
    expect(result).toEqual({
      commit: p.git("rev-parse", "--short", "HEAD").trim(),
      onto: p.git("rev-parse", "--short", mergeBase).trim(),
    });
    expect(p.git("log", "--format=%B", `${mergeBase}..HEAD`).trim()).toBe(
      "reindex local decisions: DL-002 -> DL-003\n\nRenames:\n- DL-002 -> DL-003\n\n" +
        "Squashed from original branch commits:\n- feature: draft DL-002\n- feature: annotate",
    );
    expect(p.git("ls-tree", "-r", "--name-only", "HEAD").trim().split("\n").sort()).toEqual([
      "decisions/INDEX.md",
      "decisions/records/DL-001.md",
      "decisions/records/DL-003.md",
      "dld.config.yaml",
      "src/a.py",
    ]);
    expect(p.git("diff", mergeBase, "HEAD", "--", "decisions/INDEX.md")).toBe("");
    expect(p.git("status", "--porcelain")).toBe("?? stray.txt\n");
    expect(p.git("rebase", "--quiet", "main")).toBeDefined();
  });

  test("removes INDEX.md when the merge-base had none", () => {
    const p = branchedProject();
    project = p;
    p.git("rm", "--quiet", "decisions/INDEX.md");
    p.commitAll("drop index");
    p.git("branch", "-f", "main");
    p.onMain("land DL-002", () => p.write("decisions/records/DL-002.md", recordText("DL-002")));
    p.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    p.write("decisions/INDEX.md", "new\n");
    p.commitAll("local");
    renameDecision(
      p.ctx,
      loadProject(p.ctx),
      { path: "decisions/records/DL-002.md", oldId: "DL-002", newId: "DL-003" },
      "main",
    );
    squash(p, "decisions/records/DL-002.md\tDL-002\tDL-003\n");
    expect(existsSync(join(p.root, "decisions/INDEX.md"))).toBe(false);
    expect(p.git("status", "--porcelain")).toBe("");
  });

  test("stages both sides of a branch rename and treats paths literally", () => {
    const p = branchedProject();
    project = p;
    p.write("docs/old.md", "old\n");
    p.write("docs/a[b].md", "literal\n");
    p.write("docs/ab.md", "base\n");
    p.commitAll("base files");
    p.git("branch", "-f", "main");
    p.onMain("land DL-002", () => p.write("decisions/records/DL-002.md", recordText("DL-002")));
    p.git("mv", "docs/old.md", "docs/new.md");
    p.write("docs/a[b].md", "changed\n");
    p.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    p.commitAll("local");
    writeFileSync(join(p.root, "docs/ab.md"), "uncommitted\n");
    renameDecision(
      p.ctx,
      loadProject(p.ctx),
      { path: "decisions/records/DL-002.md", oldId: "DL-002", newId: "DL-003" },
      "main",
    );
    squash(p, "decisions/records/DL-002.md\tDL-002\tDL-003\n");
    const files = p.git("ls-tree", "-r", "--name-only", "HEAD");
    expect(files).toContain("docs/new.md");
    expect(files).not.toContain("docs/old.md");
    expect(p.git("show", "HEAD:docs/a[b].md")).toBe("changed\n");
    expect(p.git("show", "HEAD:docs/ab.md")).toBe("base\n");
  });

  test("checks the base, plan and branch before changing anything", () => {
    const { p, plan } = collided();
    const before = state(p);
    expect(() => commitReindex(p.ctx, loadProject(p.ctx), plan, "nope")).toThrow(
      "base ref 'nope' not found.",
    );
    expect(() => squash(p, "\n")).toThrow("no rename plan on stdin.");
    expect(() => squash(p, "src/a.py\tDL-002\tDL-003")).toThrow("rename plan line 1");
    expect(() => commitReindex(p.ctx, loadProject(p.ctx), plan, "HEAD")).toThrow(
      "HEAD is already at the merge-base",
    );
    expect(state(p)).toEqual(before);
  });

  test("restores HEAD, index and INDEX.md when a hook rejects the commit", () => {
    const { p, plan } = collided();
    writeFileSync(join(p.root, "decisions/INDEX.md"), "working copy\n");
    const hook = join(p.root, ".git/hooks/pre-commit");
    writeFileSync(hook, "#!/bin/sh\necho rejected >&2\nexit 1\n");
    chmodSync(hook, 0o755);
    const before = state(p);
    expect(() => squash(p, plan)).toThrow(
      /commit-reindex failed while committing: git commit failed: rejected\nThe branch was restored to [0-9a-f]{40}\./,
    );
    expect(state(p)).toEqual(before);
  });

  test.each([
    ["reset", "resetting to the merge-base"],
    ["checkout", "restoring decisions/INDEX.md"],
    ["add", "staging decisions/records/DL-003.md"],
  ])("restores everything when git %s fails", (match, stepName) => {
    const { p, plan } = collided();
    const before = state(p);
    expect(() => squash(p, plan, failingGit(p, match))).toThrow(
      `commit-reindex failed while ${stepName}: git`,
    );
    expect(state(p)).toEqual(before);
  });

  test("refuses a symlinked INDEX.md before changing anything", () => {
    const { p, plan } = collided();
    rmSync(join(p.root, "decisions/INDEX.md"));
    symlinkSync("../README.md", join(p.root, "decisions/INDEX.md"));
    const head = p.git("rev-parse", "HEAD");
    expect(() => squash(p, plan)).toThrow("decisions/INDEX.md is not a regular file.");
    expect(lstatSync(join(p.root, "decisions/INDEX.md")).isSymbolicLink()).toBe(true);
    expect(p.git("rev-parse", "HEAD")).toBe(head);
  });

  test("treats an unexpected diff failure as an error", () => {
    const { p, plan } = collided();
    const before = state(p);
    const ctx: Context = {
      ...p.ctx,
      git: (args) => {
        if (args.includes("--cached")) throw new GitCommandError(args, "fatal", 128);
        return p.ctx.git(args);
      },
    };
    expect(() => squash(p, plan, ctx)).toThrow("checking the staged changes: git");
    expect(state(p)).toEqual(before);
  });

  test("reports nothing to commit and restores", () => {
    const { p, plan } = collided();
    const before = state(p);
    const ctx: Context = {
      ...p.ctx,
      git: (args) => (args.includes("--cached") ? "" : p.ctx.git(args)),
    };
    expect(() => squash(p, plan, ctx)).toThrow("nothing to commit after squash.");
    expect(state(p)).toEqual(before);
  });

  test("explains how to restore by hand when the rollback fails too", () => {
    const { p, plan } = collided();
    const ctx = failingGit(p, "read-tree");
    const failing: Context = {
      ...ctx,
      git: (args) => {
        if (args.includes("commit")) throw new GitCommandError(args, "boom");
        return ctx.git(args);
      },
    };
    expect(() => squash(p, plan, failing)).toThrow(
      /Rolling back also failed: git .*read-tree.*\nTo restore by hand: git reset --soft [0-9a-f]{40} && git read-tree [0-9a-f]{40}/,
    );
  });

  test("rethrows unexpected errors after restoring", () => {
    const { p, plan } = collided();
    const before = state(p);
    const ctx: Context = {
      ...p.ctx,
      git: (args) => {
        if (args.includes("add")) throw new Error("bug");
        return p.ctx.git(args);
      },
    };
    expect(() => squash(p, plan, ctx)).toThrow("bug");
    expect(state(p)).toEqual(before);
  });
});

test("reindexMessage summarises more than three renames and omits empty subjects", () => {
  const renames = ["2", "3", "4", "5"].map((n) => ({
    path: `decisions/records/DL-00${n}.md`,
    oldId: `DL-00${n}`,
    newId: `DL-01${n}`,
  }));
  expect(reindexMessage(renames, "")).toBe(
    "reindex 4 local decisions to avoid base-branch collisions\n\nRenames:\n" +
      "- DL-002 -> DL-012\n- DL-003 -> DL-013\n- DL-004 -> DL-014\n- DL-005 -> DL-015",
  );
});
