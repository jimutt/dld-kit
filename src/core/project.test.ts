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

// @decision(DL-098)
describe("min_dld_version", () => {
  const config = "decisions_dir: decisions\nmode: flat\nmin_dld_version: 1.3.0\n";

  test("an older dld refuses to load the project, and a newer or equal one loads it", () => {
    project = tempProject(config);
    expect(() => loadProject(project?.ctx ?? fakeContext(), { running: "1.2.9" })).toThrow(
      "this project needs dld 1.3.0 or newer; this is dld 1.2.9.",
    );
    for (const running of ["1.3.0", "1.3.0-rc.1", "2.0.0"]) {
      expect(loadProject(project.ctx, { running }).config.minDldVersion).toBe("1.3.0");
    }
  });

  test("commands that install or update dld-kit load it with any version", () => {
    project = tempProject(config);
    const loaded = loadProject(project.ctx, { anyVersion: true, running: "1.0.0" });
    expect(loaded.config.minDldVersion).toBe("1.3.0");
  });

  test("a project without the key loads with any version", () => {
    project = tempProject();
    expect(loadProject(project.ctx, { running: "0.0.1" }).config.minDldVersion).toBeUndefined();
  });

  test("a value that is not a plain version makes the config invalid", () => {
    for (const value of ["1.3", "v1.3.0", "1.3.0-rc.1", "latest", "1.3", "[1, 3, 0]"]) {
      project?.cleanup();
      project = tempProject(`decisions_dir: decisions\nmode: flat\nmin_dld_version: ${value}\n`);
      expect(() => loadProject(project?.ctx ?? fakeContext())).toThrow(
        "'min_dld_version' must be a version such as 1.1.0",
      );
    }
  });
});
