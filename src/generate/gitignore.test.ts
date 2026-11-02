import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeContext } from "../node-context.ts";
import { type TempProject, tempProject } from "../test-helpers.ts";
import {
  applyLocalSettingsIgnore,
  LOCAL_IGNORE_COMMENT,
  planLocalSettingsIgnore,
} from "./gitignore.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

const LINE = "/dld.local.yaml";

function ensure(p: TempProject) {
  const plan = planLocalSettingsIgnore(p.ctx, p.root);
  return { plan, wrote: applyLocalSettingsIgnore(p.ctx, p.root, plan) };
}

const gitignore = (p: TempProject) => readFileSync(join(p.root, ".gitignore"), "utf8");

// @decision(DL-087)
describe("planLocalSettingsIgnore", () => {
  test("creates .gitignore with the line, then finds it ignored", () => {
    project = tempProject();
    expect(ensure(project)).toEqual({
      plan: { content: `${LOCAL_IGNORE_COMMENT}\n${LINE}\n`, creates: true, warnings: [] },
      wrote: true,
    });
    expect(ensure(project)).toEqual({ plan: { warnings: [] }, wrote: false });
  });

  test("appends after existing content, keeping its line endings", () => {
    project = tempProject();
    project.write(".gitignore", "node_modules/\r\ndist/");
    ensure(project);
    expect(gitignore(project)).toBe(
      `node_modules/\r\ndist/\r\n\r\n${LOCAL_IGNORE_COMMENT}\r\n${LINE}\r\n`,
    );
  });

  test("leaves files alone when another rule already ignores dld.local.yaml", () => {
    project = tempProject();
    project.write(".git/info/exclude", "*.local.yaml\n");
    expect(ensure(project)).toEqual({ plan: { warnings: [] }, wrote: false });
    project.write(".git/info/exclude", "");
    project.write(".gitignore", "dld.local.yaml\n");
    expect(ensure(project).wrote).toBe(false);
  });

  test("warns instead of editing a .gitignore that isn't a regular file", () => {
    project = tempProject();
    mkdirSync(join(project.root, "elsewhere"));
    symlinkSync(join(project.root, "elsewhere", "ignore"), join(project.root, ".gitignore"));
    const { plan, wrote } = ensure(project);
    expect(wrote).toBe(false);
    expect(plan.warnings).toEqual([
      `.gitignore is not a regular file, so dld-kit does not edit it. Add this line to it yourself: ${LINE}`,
    ]);
  });

  test("warns about a dld.local.yaml that is already committed", () => {
    project = tempProject();
    project.write("dld.local.yaml", "review_model: opus\n");
    project.git("add", "dld.local.yaml");
    project.git("commit", "-qm", "settings");
    const { plan, wrote } = ensure(project);
    expect(wrote).toBe(true);
    expect(plan.warnings).toEqual([
      "dld.local.yaml is committed, so everyone gets these personal settings. Run `git rm --cached dld.local.yaml` and commit, to keep it to your checkout.",
    ]);
    expect(ensure(project).plan.warnings).toHaveLength(1);
  });

  test("respects a rule that deliberately keeps dld.local.yaml", () => {
    project = tempProject();
    project.write(".gitignore", "*.yaml\n!dld.local.yaml\n");
    const { plan, wrote } = ensure(project);
    expect(wrote).toBe(false);
    expect(plan.warnings).toEqual([
      'a "!dld.local.yaml" rule keeps dld.local.yaml out of git\'s ignore list, so dld-kit does not add one. Personal settings in it will be committed.',
    ]);
  });

  test("warns when git can't tell, outside a repository", () => {
    const outside = mkdtempSync(join(tmpdir(), "dld-no-repo-"));
    try {
      const plan = planLocalSettingsIgnore(createNodeContext(outside, {}), outside);
      expect(plan.content).toBeUndefined();
      expect(plan.warnings[0]).toStartWith("could not check whether git ignores dld.local.yaml.");
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
