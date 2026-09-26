import { afterEach, describe, expect, test } from "bun:test";
import { type TempProject, tempProject } from "../test-helpers.ts";
import type { Context } from "./context.ts";
import { GhCommandError, ToolNotFoundError } from "./errors.ts";
import { openPrIds } from "./open-prs.ts";
import { loadProject } from "./project.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

type Gh = Context["gh"];

/** A fake gh answering by subcommand; unlisted calls succeed with empty output. */
function fakeGh(answers: Record<string, () => string>, calls: string[][] = []): Gh {
  return (args) => {
    calls.push([...args]);
    return answers[args.slice(0, 2).join(" ")]?.() ?? answers[args[0] ?? ""]?.() ?? "";
  };
}

function scan(gh: Gh, remote: string | null = "git@github.com:o/r.git", base = "origin/main") {
  project = tempProject(undefined, { gh });
  if (remote !== null) project.git("remote", "add", "origin", remote);
  project.git("checkout", "--quiet", "-b", "feature");
  return openPrIds(project.ctx, loadProject(project.ctx).paths, base);
}

const fail = (stderr: string) => () => {
  throw new GhCommandError(["x"], stderr);
};

describe("openPrIds", () => {
  test("skips when gh is not installed", () => {
    const gh = () => {
      throw new ToolNotFoundError("gh");
    };
    expect(scan(gh)).toEqual({ ids: [], skipped: "gh CLI not installed" });
  });

  test("skips when origin is missing or not on GitHub", () => {
    expect(scan(fakeGh({}), null).skipped).toBe("origin is not a GitHub remote");
    project?.cleanup();
    expect(scan(fakeGh({}), "https://gitlab.com/o/r.git").skipped).toBe(
      "origin is not a GitHub remote",
    );
  });

  test("skips when gh is not authenticated", () => {
    expect(scan(fakeGh({ "auth status": fail("not logged in") })).skipped).toBe(
      "gh not authenticated",
    );
  });

  test("reports a failed or timed-out pr list instead of passing silently", () => {
    const failing = fakeGh({ "pr list": fail("HTTP 502\nmore detail") });
    expect(scan(failing).skipped).toBe("gh pr list failed: HTTP 502");
    project?.cleanup();
    expect(scan(fakeGh({ "pr list": fail("") })).skipped).toBe(
      "gh pr list failed: no error output",
    );
  });

  test("reports output that is not a list of PRs", () => {
    for (const output of ["not json", "{}", "[1]"]) {
      expect(scan(fakeGh({ "pr list": () => output })).skipped).toBe(
        "gh pr list returned unexpected output",
      );
      project?.cleanup();
    }
  });

  test("reads IDs from record paths of other branches' PRs targeting the base", () => {
    const calls: string[][] = [];
    const prs = [
      {
        headRefName: "other",
        files: [
          { path: "decisions/records/DL-007.md" },
          { path: "decisions/records/billing/DL-012.md" },
          { path: "notes/DL-099.md" },
          { path: "decisions/recordsX/DL-098.md" },
          { nope: true },
        ],
      },
      { headRefName: "feature", files: [{ path: "decisions/records/DL-050.md" }] },
      { headRefName: "third" },
    ];
    const result = scan(fakeGh({ "pr list": () => JSON.stringify(prs) }, calls));
    expect(result).toEqual({ ids: ["DL-007", "DL-012"] });
    expect(calls.find((c) => c[0] === "pr")).toEqual([
      "pr",
      "list",
      "--state",
      "open",
      "--base",
      "main",
      "--json",
      "files,headRefName",
      "--limit",
      "100",
    ]);
  });

  test("passes a base without an origin/ prefix through unchanged", () => {
    const calls: string[][] = [];
    scan(fakeGh({ "pr list": () => "[]" }, calls), undefined, "develop");
    expect(calls.find((c) => c[0] === "pr")?.[5]).toBe("develop");
  });

  test("still scans when gh --version fails, and rethrows unexpected errors", () => {
    expect(scan(fakeGh({ "--version": fail("odd"), "pr list": () => "[]" }))).toEqual({ ids: [] });
    project?.cleanup();
    const broken = () => {
      throw new Error("bug");
    };
    expect(() => scan(broken)).toThrow("bug");
    project?.cleanup();
    expect(() => scan(fakeGh({ "auth status": broken }))).toThrow("bug");
    project?.cleanup();
    expect(() => scan(fakeGh({ "pr list": broken }))).toThrow("bug");
  });
});
