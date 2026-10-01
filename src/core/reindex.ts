import { basename } from "node:path";
import type { Context } from "./context.ts";
import { DldError, GitCommandError } from "./errors.ts";
import { gitAt, gitOrEmpty, nulSeparated, recordsPathspec } from "./git.ts";
import { formatId } from "./ids.ts";
import { openPrIds, type PrClaim } from "./open-prs.ts";
import type { Project, ProjectPaths } from "./project.ts";
import { DECISION_MENTION, RECORD_FILE } from "./records.ts";

export const DEFAULT_BASE = "origin/main";

type Git = (...args: string[]) => string;

export interface Collision {
  /** Root-relative, `/`-separated path of the locally added record. */
  path: string;
  id: string;
}

export interface Rename {
  path: string;
  oldId: string;
  newId: string;
}

/** A result, plus the reason the open-PR scan was skipped, if it was. */
export type WithScan<T> = T & { skipped?: string };

const idNumber = (id: string) => Number.parseInt(id.slice(3), 10);

/** Orders IDs by number; IDs with the same number (DL-01, DL-001) by text. */
export function compareIds(a: string, b: string): number {
  return idNumber(a) - idNumber(b) || (a < b ? -1 : a > b ? 1 : 0);
}

// @decision(DL-027)
/**
 * The upstream branch, when it tracks a branch with a different name than the current one;
 * otherwise `origin/main`. Needs no dld.config.yaml.
 */
export function resolveBase(ctx: Context): string {
  const git: Git = (...args) => ctx.git(args);
  const current = gitOrEmpty(git, "rev-parse", "--abbrev-ref", "HEAD").trim();
  const upstream = gitOrEmpty(
    git,
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ).trim();
  if (upstream !== "") {
    const slash = upstream.indexOf("/");
    const branch = slash === -1 ? upstream : upstream.slice(slash + 1);
    if (branch !== "" && branch !== current) return upstream;
  }
  return DEFAULT_BASE;
}

/**
 * Fails unless `base` names a commit. `hint` is appended to the error message. A base that
 * looks like an option is rejected before it reaches git or gh.
 */
export function verifyBase(ctx: Context, paths: ProjectPaths, base: string, hint = ""): void {
  if (base.startsWith("-")) throw new DldError(`--base must be a git ref, got '${base}'`);
  const git = gitAt(ctx, paths.root);
  if (gitOrEmpty(git, "rev-parse", "--verify", "--quiet", `${base}^{commit}`) === "") {
    throw new DldError(`base ref '${base}' not found.${hint}`);
  }
}

/** The merge-base of `base` and HEAD. */
export function mergeBase(ctx: Context, paths: ProjectPaths, base: string): string {
  return gitAt(ctx, paths.root)("merge-base", base, "HEAD").trim();
}

function localAdditions(git: Git, paths: ProjectPaths, base: string): string[] {
  return nulSeparated(
    gitOrEmpty(
      git,
      "diff",
      "-z",
      "--name-only",
      "--diff-filter=A",
      `${base}...HEAD`,
      "--",
      recordsPathspec(paths),
    ),
  );
}

interface Taken {
  /** Every taken ID, unique and sorted by number. */
  ids: string[];
  onBase: Set<string>;
  claims: PrClaim[];
}

function takenIds(ctx: Context, paths: ProjectPaths, base: string): WithScan<Taken> {
  const git = gitAt(ctx, paths.root);
  const onBase = nulSeparated(
    gitOrEmpty(git, "ls-tree", "-r", "-z", "--name-only", base, "--", recordsPathspec(paths)),
  ).flatMap((path) => path.match(DECISION_MENTION) ?? []);
  const scan = openPrIds(ctx, paths, base);
  const ids = [...new Set([...onBase, ...scan.claims.map(({ id }) => id)])].sort(compareIds);
  const taken = { ids, onBase: new Set(onBase), claims: scan.claims };
  return scan.skipped === undefined ? taken : { ...taken, skipped: scan.skipped };
}

/** Whether `ancestor` is `commit` or one of its ancestors; false when git cannot tell. */
function isAncestor(git: Git, ancestor: string, commit: string): boolean {
  try {
    git("merge-base", "--is-ancestor", ancestor, commit);
    return true;
  } catch (error) {
    if (error instanceof GitCommandError) return false;
    throw error;
  }
}

// @decision(DL-065)
/**
 * Whether a record added on this branch collides with a taken ID. A PR's claim does not count
 * when the commit that added the record here is in that PR's history: the record came from
 * the PR. A claim whose head commit is unknown or not fetched counts.
 */
function collides(git: Git, base: string, { path, id }: Collision, taken: Taken): boolean {
  if (taken.onBase.has(id)) return true;
  const claims = taken.claims.filter((claim) => claim.id === id);
  if (claims.length === 0) return false;
  const added = git(
    "--literal-pathspecs",
    "log",
    "-1",
    "--format=%H",
    "--diff-filter=A",
    `${base}..HEAD`,
    "--",
    path,
  ).trim();
  return claims.some(
    ({ head }) => head === undefined || added === "" || !isAncestor(git, added, head),
  );
}

// @decision(DL-027) @decision(DL-065)
/** IDs taken on the base branch and in open PRs, sorted by number. */
export function listTakenIds(
  ctx: Context,
  { paths }: Project,
  base: string,
): WithScan<{ ids: string[] }> {
  verifyBase(ctx, paths, base, " Fetch first or pass --base.");
  const { ids, skipped } = takenIds(ctx, paths, base);
  return skipped === undefined ? { ids } : { ids, skipped };
}

function collisionsOf(
  ctx: Context,
  paths: ProjectPaths,
  base: string,
): WithScan<{ collisions: Collision[]; localIds: string[]; taken: string[] }> {
  const git = gitAt(ctx, paths.root);
  const added = localAdditions(git, paths, base);
  const local = added.flatMap((path) => {
    const id = basename(path, ".md");
    return RECORD_FILE.test(basename(path)) ? [{ path, id }] : [];
  });
  if (local.length === 0) return { collisions: [], localIds: [], taken: [] };
  const taken = takenIds(ctx, paths, base);
  const result = {
    collisions: local.filter((record) => collides(git, base, record, taken)),
    localIds: local.map(({ id }) => id),
    taken: taken.ids,
  };
  return taken.skipped === undefined ? result : { ...result, skipped: taken.skipped };
}

// @decision(DL-027)
/** Records added on this branch whose IDs are taken on the base branch or in open PRs. */
export function findCollisions(
  ctx: Context,
  { paths }: Project,
  base: string,
): WithScan<{ collisions: Collision[] }> {
  verifyBase(ctx, paths, base);
  const { collisions, skipped } = collisionsOf(ctx, paths, base);
  return skipped === undefined ? { collisions } : { collisions, skipped };
}

// @decision(DL-027)
/**
 * A rename for each collision, in ID order, to consecutive IDs above every ID taken or added
 * locally.
 */
export function planRenames(
  ctx: Context,
  { paths }: Project,
  base: string,
): WithScan<{ renames: Rename[] }> {
  verifyBase(ctx, paths, base);
  const { collisions, localIds, taken, skipped } = collisionsOf(ctx, paths, base);
  const highest = [...taken, ...localIds].reduce((max, id) => Math.max(max, idNumber(id)), 0);
  const renames = [...collisions]
    .sort((a, b) => compareIds(a.id, b.id) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(({ path, id }, index) => ({ path, oldId: id, newId: formatId(highest + 1 + index) }));
  return skipped === undefined ? { renames } : { renames, skipped };
}

/** `<path>\t<DL-OLD>\t<DL-NEW>`, the rename plan's line format. */
export function formatRename({ path, oldId, newId }: Rename): string {
  return `${path}\t${oldId}\t${newId}`;
}
