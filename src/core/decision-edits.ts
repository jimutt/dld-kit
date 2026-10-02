import { basename, join, relative, sep } from "node:path";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";
import { writeFileAtomic } from "./files.ts";
import { gitAt, gitOrEmpty, nulSeparated, recordsPathspec } from "./git.ts";
import type { Project, ProjectPaths } from "./project.ts";
import { findRecordFile, parseRecord, RECORD_FILE, recordBody, recordHead } from "./records.ts";
import { mergeBase, resolveBase, verifyBase } from "./reindex.ts";

/**
 * A record's state against the base branch: not on it (`draft`), on it and unchanged
 * (`integrated`), on it with a changed body (`edited`), or on it and gone here (`deleted`).
 */
export type RecordState = "draft" | "integrated" | "edited" | "deleted";

export interface RecordEdit {
  /** Root-relative, `/`-separated path. */
  path: string;
  id: string;
  state: RecordState;
}

// @decision(DL-066)
/**
 * The base to check against: `base` when given, else `resolve-base`'s answer, falling back to
 * the local branch when that is a remote branch that doesn't exist (`origin/main` → `main`).
 */
export function editBase(ctx: Context, paths: ProjectPaths, base?: string): string {
  if (base !== undefined) {
    verifyBase(ctx, paths, base, " Fetch first or pass --base.");
    return base;
  }
  const resolved = resolveBase(ctx);
  const git = gitAt(ctx, paths.root);
  const exists = (ref: string) =>
    gitOrEmpty(git, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`) !== "";
  if (exists(resolved)) return resolved;
  const local = resolved.startsWith("origin/") ? resolved.slice("origin/".length) : undefined;
  if (local !== undefined && exists(local)) return local;
  throw new DldError(`base ref '${resolved}' not found. Fetch first or pass --base.`);
}

// @decision(DL-066)
/**
 * Without `ids`: every integrated record whose body was edited or that was deleted. With `ids`:
 * the state of each. Integrated means present at the merge-base of `base` and HEAD; the body is
 * compared with that copy, so frontmatter changes never count.
 */
export function checkDecisionEdits(
  ctx: Context,
  { paths }: Project,
  base: string,
  ids: readonly string[] = [],
): RecordEdit[] {
  const git = gitAt(ctx, paths.root);
  const { onto, integrated } = integratedRecords(ctx, paths, base);

  const edit = (path: string): RecordEdit => {
    const id = basename(path, ".md");
    const before = git("show", `${onto}:${path}`);
    if (isProposed(before, path)) return { path, id, state: "draft" };
    const full = join(paths.root, path);
    if (!ctx.fs.isRegularFile(full)) return { path, id, state: "deleted" };
    const same = normalizedBody(ctx.fs.readFile(full)) === normalizedBody(before);
    return { path, id, state: same ? "integrated" : "edited" };
  };

  if (ids.length === 0) {
    const integratedSet = new Set(integrated);
    const changed = nulSeparated(
      gitOrEmpty(
        git,
        "diff",
        "-z",
        "--no-renames",
        "--name-only",
        onto,
        "--",
        recordsPathspec(paths),
      ),
    );
    return changed
      .filter((path) => integratedSet.has(path))
      .sort()
      .map(edit)
      .filter(({ state }) => state === "edited" || state === "deleted");
  }

  return ids.map((id) => {
    const path = integrated.find((candidate) => basename(candidate) === `${id}.md`);
    if (path !== undefined) return edit(path);
    const local = findRecordFile(ctx, paths.recordsDir, id);
    if (local === undefined) throw new DldError(`decision ${id} not found.`);
    return { path: relative(paths.root, local).split(sep).join("/"), id, state: "draft" };
  });
}

/** The merge-base of `base` and HEAD, and the record paths that exist there. */
function integratedRecords(ctx: Context, paths: ProjectPaths, base: string) {
  const onto = mergeBase(ctx, paths, base);
  const integrated = nulSeparated(
    gitOrEmpty(
      gitAt(ctx, paths.root),
      "ls-tree",
      "-r",
      "-z",
      "--name-only",
      onto,
      "--",
      recordsPathspec(paths),
    ),
  ).filter((path) => RECORD_FILE.test(basename(path)));
  return { onto, integrated };
}

// @decision(DL-066)
/** A record that was still proposed on the base stays a draft: proposed records are mutable. */
function isProposed(text: string, source: string): boolean {
  try {
    return parseRecord(text, source).status === "proposed";
  } catch {
    return false;
  }
}

// @decision(DL-068)
/**
 * Puts back the body of each integrated record as it is at the merge-base, keeping the
 * current frontmatter. A deleted record is restored whole. Returns the paths written.
 */
export function restoreDecisionProse(
  ctx: Context,
  { paths }: Project,
  base: string,
  ids: readonly string[],
): string[] {
  const git = gitAt(ctx, paths.root);
  const { onto, integrated } = integratedRecords(ctx, paths, base);
  const targets = ids.map((id) => {
    const path = integrated.find((candidate) => basename(candidate) === `${id}.md`);
    if (path === undefined) throw new DldError(`${id} is not on the base branch; it is a draft.`);
    return path;
  });
  for (const path of targets) {
    const before = git("show", `${onto}:${path}`);
    const full = join(paths.root, path);
    const current = ctx.fs.isRegularFile(full) ? ctx.fs.readFile(full) : undefined;
    const head = current === undefined ? undefined : recordHead(current);
    const text = head === undefined ? before : head + recordBody(before);
    writeFileAtomic(ctx, full, text);
  }
  return targets;
}

function normalizedBody(text: string): string {
  return recordBody(text.replace(/\r\n/g, "\n"));
}

/** `<path>\t<DL-NNN>\t<state>`, the command's line format. */
export function formatRecordEdit({ path, id, state }: RecordEdit): string {
  return `${path}\t${id}\t${state}`;
}
