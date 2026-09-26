import type { Context } from "./context.ts";
import { GhCommandError, ToolNotFoundError } from "./errors.ts";
import { gitAt, gitOrEmpty, recordsPathspec } from "./git.ts";
import type { ProjectPaths } from "./project.ts";

export interface OpenPrScan {
  /** IDs in record paths touched by open PRs, unsorted and possibly repeated. */
  ids: string[];
  /** Why the scan did not run or did not finish, if it did not. */
  skipped?: string;
}

const GITHUB_REMOTE = /github\.com[:/]/;
const MENTION = /DL-\d+/g;
const PR_LIMIT = "100";

// @decision(DL-026)
/**
 * Decision IDs claimed by open PRs that target `base`, read from the paths they touch under the
 * records directory. PRs from the current branch are not counted. Best-effort: anything that
 * stops the scan is returned as `skipped` rather than thrown.
 */
export function openPrIds(ctx: Context, paths: ProjectPaths, base: string): OpenPrScan {
  const skipped = (reason: string): OpenPrScan => ({ ids: [], skipped: reason });
  try {
    ctx.gh(["--version"]);
  } catch (error) {
    if (error instanceof ToolNotFoundError) return skipped("gh CLI not installed");
    if (!(error instanceof GhCommandError)) throw error;
  }
  const git = gitAt(ctx, paths.root);
  if (!GITHUB_REMOTE.test(gitOrEmpty(git, "remote", "get-url", "origin"))) {
    return skipped("origin is not a GitHub remote");
  }
  try {
    ctx.gh(["auth", "status"]);
  } catch (error) {
    if (error instanceof GhCommandError) return skipped("gh not authenticated");
    throw error;
  }

  const prBase = base.startsWith("origin/") ? base.slice("origin/".length) : base;
  let output: string;
  try {
    output = ctx.gh([
      "pr",
      "list",
      "--state",
      "open",
      "--base",
      prBase,
      "--json",
      "files,headRefName",
      "--limit",
      PR_LIMIT,
    ]);
  } catch (error) {
    if (error instanceof GhCommandError) {
      return skipped(`gh pr list failed: ${firstLine(error.stderr) || "no error output"}`);
    }
    throw error;
  }

  const prs = parsePrList(output);
  if (prs === undefined) return skipped("gh pr list returned unexpected output");
  const current = gitOrEmpty(git, "rev-parse", "--abbrev-ref", "HEAD").trim();
  const prefix = `${recordsPathspec(paths)}/`;
  const ids: string[] = [];
  for (const pr of prs) {
    if (pr.headRefName === current) continue;
    for (const path of pr.files) {
      if (path.startsWith(prefix)) ids.push(...(path.match(MENTION) ?? []));
    }
  }
  return { ids };
}

interface PullRequest {
  headRefName: string | undefined;
  files: string[];
}

function parsePrList(output: string): PullRequest[] | undefined {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    return undefined;
  }
  if (!Array.isArray(value)) return undefined;
  const prs: PullRequest[] = [];
  for (const item of value) {
    if (!isObject(item)) return undefined;
    const files = Array.isArray(item.files) ? item.files : [];
    prs.push({
      headRefName: typeof item.headRefName === "string" ? item.headRefName : undefined,
      files: files.flatMap((file) =>
        isObject(file) && typeof file.path === "string" ? [file.path] : [],
      ),
    });
  }
  return prs;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstLine(text: string): string {
  return text.split("\n", 1)[0]?.trim() ?? "";
}
