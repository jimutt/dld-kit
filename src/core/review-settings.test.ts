import { afterEach, describe, expect, test } from "bun:test";
import { FLAT_CONFIG, type TempProject, tempProject } from "../test-helpers.ts";
import { DldError } from "./errors.ts";
import { loadProject } from "./project.ts";
import { formatReviewSettings, reviewSettings } from "./review-settings.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

function settings(config: string, local: string | undefined, step: string) {
  project = tempProject(`${FLAT_CONFIG}${config}`);
  if (local !== undefined) project.write("dld.local.yaml", local);
  return reviewSettings(project.ctx, loadProject(project.ctx), step);
}

// @decision(DL-087) @decision(DL-088) @decision(DL-089)
describe("reviewSettings", () => {
  test("defaults: the implementation is reviewed, the plan is not, on the harness's model", () => {
    expect(settings("", undefined, "implement")).toEqual({
      review: true,
      reviewFrom: "default",
      modelFrom: "default",
    });
    project?.cleanup();
    expect(settings("", undefined, "plan")).toEqual({
      review: false,
      reviewFrom: "default",
      modelFrom: "default",
    });
  });

  test("dld.config.yaml sets the team's choice; a step's model key wins over review_model", () => {
    const config = "plan_review: true\nreview_model: sonnet\nplan_review_model: opus\n";
    expect(settings(config, undefined, "plan")).toEqual({
      review: true,
      reviewFrom: "dld.config.yaml",
      model: "opus",
      modelFrom: "dld.config.yaml",
    });
    project?.cleanup();
    expect(settings(config, undefined, "implement")).toMatchObject({
      review: true,
      reviewFrom: "default",
      model: "sonnet",
    });
  });

  test("dld.local.yaml wins over dld.config.yaml, file before key", () => {
    const config = "implement_review: true\nimplement_review_model: opus\n";
    const local = "implement_review: false\nreview_model: gpt-sol-6.1\n";
    expect(settings(config, local, "implement")).toEqual({
      review: false,
      reviewFrom: "dld.local.yaml",
      model: "gpt-sol-6.1",
      modelFrom: "dld.local.yaml",
    });
  });

  test("a dld.local.yaml without review keys leaves the config's settings", () => {
    const result = settings("review_model: opus\n", "x-note: mine\nbase_branch: dev\n", "plan");
    expect(result).toMatchObject({ model: "opus", modelFrom: "dld.config.yaml" });
    expect(project?.warnings).toEqual([
      "dld.local.yaml: 'base_branch' can only be set in dld.config.yaml",
    ]);
  });

  test("rejects an unknown step as a usage error", () => {
    let caught: unknown;
    try {
      settings("", undefined, "audit");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DldError);
    expect(caught).toMatchObject({
      message: "unknown review step 'audit'; expected implement or plan.",
      exitCode: 2,
    });
  });

  test("formats one line per setting", () => {
    expect(
      formatReviewSettings({ review: true, reviewFrom: "default", modelFrom: "default" }),
    ).toBe("review: on\nreview_from: default\nmodel: default\nmodel_from: default\n");
    expect(
      formatReviewSettings({
        review: false,
        reviewFrom: "dld.local.yaml",
        model: "opus",
        modelFrom: "dld.config.yaml",
      }),
    ).toBe("review: off\nreview_from: dld.local.yaml\nmodel: opus\nmodel_from: dld.config.yaml\n");
  });
});
