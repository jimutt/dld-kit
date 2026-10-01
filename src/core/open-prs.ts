import type { Context } from "./context.ts";
import { GhCommandError, ToolNotFoundError } from "./errors.ts";
import { gitAt, gitOrEmpty, recordsPathspec } from "./git.ts";
import type { ProjectPaths } from "./project.ts";
import { DECISION_MENTION } from "./records.ts";

/** A decision ID in a record path an open PR touches, with that PR's head commit. */
export interface PrClaim {
  id: string;
  /** The PR's head commit, if gh reported one. */
  head: string | undefined;
}

export interface OpenPrScan {
  /** One per ID per PR, unsorted; an ID claimed by two PRs appears twice. */
  claims: PrClaim[];
  /** Why the scan did not run or did not finish, if it did not. */
  skipped?: string;
}

const GITHUB_REMOTE = /github\.com[:/]/;
const PR_LIMIT = "100";
/** A full SHA-1 or SHA-256 commit ID; anything else is not passed to git. */
const COMMIT_ID = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

// @decision(DL-026) @decision(DL-065)
/**
 * Decision IDs claimed by open PRs that target `base`, read from the paths they touch under the
 * records directory, each with the PR's head commit. The PR from this repository's current
 * branch is not counted. Best-effort: anything that stops the scan is returned as `skipped`
 * rather than thrown.
 */
export function openPrIds(ctx: Context, paths: ProjectPaths, base: string): OpenPrScan {
  const skipped = (reason: string): OpenPrScan => ({ claims: [], skipped: reason });
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
      `--base=${prBase}`,
      "--json",
      "files,headRefName,headRefOid,isCrossRepository",
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
  const claims: PrClaim[] = [];
  for (const pr of prs) {
    if (!pr.isCrossRepository && pr.headRefName === current) continue;
    for (const path of pr.files) {
      if (!path.startsWith(prefix)) continue;
      for (const id of path.match(DECISION_MENTION) ?? []) claims.push({ id, head: pr.headRefOid });
    }
  }
  return { claims };
}

interface PullRequest {
  headRefName: string | undefined;
  headRefOid: string | undefined;
  isCrossRepository: boolean;
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
      headRefOid:
        typeof item.headRefOid === "string" && COMMIT_ID.test(item.headRefOid)
          ? item.headRefOid
          : undefined,
      isCrossRepository: item.isCrossRepository === true,
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
