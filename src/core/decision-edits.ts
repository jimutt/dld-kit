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
 * Without `ids`: every integrated record whose locked content (body, `id`, `timestamp`) was
 * edited, or that was deleted. With `ids`: the state of each. Integrated means present at the
 * merge-base of `base` and HEAD; the record is compared with that copy, so changes to other
 * frontmatter keys never count.
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
    const same = lockedContent(ctx.fs.readFile(full), path) === lockedContent(before, path);
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
 * Puts back the locked parts of each integrated record (body, `id`, `timestamp`) as they are
 * at the merge-base, keeping the rest of the current frontmatter. A deleted record is restored
 * whole. Returns the paths written.
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
    const baseHead = recordHead(before);
    const text =
      head === undefined || baseHead === undefined
        ? before
        : withLockedLines(head, baseHead) + recordBody(before);
    writeFileAtomic(ctx, full, text);
  }
  return targets;
}

/** Frontmatter keys locked with the body; every other key stays editable. */
const LOCKED_KEYS = ["id", "timestamp"] as const;

// @decision(DL-066)
/** The parts of a record that are locked once it is integrated: the body, `id` and `timestamp`. */
function lockedContent(text: string, source: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  let fields: string;
  try {
    const record = parseRecord(normalized, source);
    fields = JSON.stringify([record.id, record.timestamp ?? null]);
  } catch {
    // Unparseable frontmatter: compare all of it, so a broken edit is reported.
    fields = recordHead(normalized) ?? "";
  }
  return `${fields}\n${recordBody(normalized)}`;
}

/** `head` with each locked key's line taken from `baseHead`, or added when it is missing. */
function withLockedLines(head: string, baseHead: string): string {
  let result = head;
  for (const key of LOCKED_KEYS) {
    const pattern = new RegExp(`^${key}:.*$`, "m");
    const line = baseHead.match(pattern)?.[0];
    if (line === undefined) continue;
    result = pattern.test(result)
      ? result.replace(pattern, () => line)
      : result.replace(
          /^---\r?\n/,
          (open) => `${open}${line}${open.endsWith("\r\n") ? "\r\n" : "\n"}`,
        );
  }
  return result;
}

/** `<path>\t<DL-NNN>\t<state>`, the command's line format. */
export function formatRecordEdit({ path, id, state }: RecordEdit): string {
  return `${path}\t${id}\t${state}`;
}
