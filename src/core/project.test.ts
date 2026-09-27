import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createNodeContext } from "../node-context.ts";
import { fakeContext, type TempProject, tempProject } from "../test-helpers.ts";
import { GitCommandError } from "./errors.ts";
import { findProjectRoot, loadProject } from "./project.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

describe("findProjectRoot", () => {
  test("returns the git root, also from a subdirectory", () => {
    project = tempProject();
    const sub = join(project.root, "a", "b");
    mkdirSync(sub, { recursive: true });
    expect(findProjectRoot(project.ctx)).toBe(project.root);
    expect(findProjectRoot(createNodeContext(sub, project.ctx.env))).toBe(project.root);
  });

  test("reports 'not a git repository' when git rev-parse fails", () => {
    const ctx = fakeContext({
      git: (args) => {
        throw new GitCommandError(args, "fatal: not a git repository");
      },
    });
    expect(() => findProjectRoot(ctx)).toThrow(/^not a git repository$/);
  });

  test("lets other failures through", () => {
    const ctx = fakeContext({
      git: () => {
        throw new Error("boom");
      },
    });
    expect(() => findProjectRoot(ctx)).toThrow("boom");
  });
});

describe("loadProject", () => {
  test("resolves the decisions and records directories from the config", () => {
    project = tempProject("decisions_dir: docs/decisions\nmode: flat\n");
    const { paths } = loadProject(project.ctx);
    expect(paths).toEqual({
      root: project.root,
      decisionsDir: join(project.root, "docs/decisions"),
      recordsDir: join(project.root, "docs/decisions/records"),
    });
  });
});
