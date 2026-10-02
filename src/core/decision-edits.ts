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

export interface CheckOptions {
  /**
   * Compare with HEAD instead of the merge-base: only uncommitted changes count. Whether a
   * record is integrated is still decided at the merge-base.
   */
  uncommitted?: boolean;
}

/** The merge-base copy of an integrated record and where the record is now. */
interface Located {
  id: string;
  /** Its path at the merge-base. */
  basePath: string;
  baseText: string;
  /** Its path in the working tree, if it still exists (possibly moved to another folder). */
  current: string | undefined;
}

// @decision(DL-066)
/**
 * Without `ids`: every integrated record whose locked content (body, `id`, `timestamp`) was
 * edited, or that was deleted. With `ids`: the state of each. Integrated means present at the
 * merge-base of `base` and HEAD, and not `proposed` there. The record is compared with its
 * merge-base copy, or with HEAD's under `uncommitted`, so changes to other frontmatter keys
 * never count. A record moved to another folder is followed by its ID.
 */
export function checkDecisionEdits(
  ctx: Context,
  { paths }: Project,
  base: string,
  ids: readonly string[] = [],
  { uncommitted = false }: CheckOptions = {},
): RecordEdit[] {
  const git = gitAt(ctx, paths.root);
  const records = integratedRecords(ctx, paths, base);

  const stateOf = (id: string): RecordEdit => {
    const located = locate(ctx, paths, records, id);
    if (located === undefined) {
      const local = findRecordFile(ctx, paths.recordsDir, id);
      if (local === undefined) throw new DldError(`decision ${id} not found.`);
      return { path: toPosix(relative(paths.root, local)), id, state: "draft" };
    }
    const path = located.current ?? located.basePath;
    if (isProposed(located.baseText, located.basePath)) return { path, id, state: "draft" };
    const reference = uncommitted ? atHead(git, located) : { text: located.baseText, path };
    // Gone at HEAD: a committed deletion or move, not an uncommitted change.
    if (reference === undefined) return { path, id, state: "integrated" };
    if (located.current === undefined) return { path, id, state: "deleted" };
    const now = ctx.fs.readFile(join(paths.root, located.current));
    const same = lockedContent(now, path) === lockedContent(reference.text, reference.path);
    return { path, id, state: same ? "integrated" : "edited" };
  };

  if (ids.length > 0) return ids.map(stateOf);

  const changed = nulSeparated(
    gitOrEmpty(
      git,
      "diff",
      "-z",
      "--no-renames",
      "--name-only",
      uncommitted ? "HEAD" : records.onto,
      "--",
      recordsPathspec(paths),
    ),
  );
  const candidates = new Set(
    changed
      .map((path) => basename(path))
      .filter((name) => RECORD_FILE.test(name))
      .map((name) => basename(name, ".md"))
      .filter((id) => records.byId.has(id)),
  );
  return [...candidates]
    .map(stateOf)
    .filter(({ state }) => state === "edited" || state === "deleted")
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

interface Integrated {
  onto: string;
  /** ID → path at the merge-base. */
  byId: Map<string, string>;
}

/** The merge-base of `base` and HEAD, and the record paths that exist there. */
function integratedRecords(ctx: Context, paths: ProjectPaths, base: string): Integrated {
  const onto = mergeBase(ctx, paths, base);
  const byId = new Map<string, string>();
  const listing = gitOrEmpty(
    gitAt(ctx, paths.root),
    "ls-tree",
    "-r",
    "-z",
    "--name-only",
    onto,
    "--",
    recordsPathspec(paths),
  );
  for (const path of nulSeparated(listing)) {
    const name = basename(path);
    if (RECORD_FILE.test(name)) byId.set(basename(name, ".md"), path);
  }
  return { onto, byId };
}

/** An integrated record's merge-base copy and current path, or undefined for a draft. */
function locate(
  ctx: Context,
  paths: ProjectPaths,
  { onto, byId }: Integrated,
  id: string,
): Located | undefined {
  const basePath = byId.get(id);
  if (basePath === undefined) return undefined;
  const baseText = gitAt(ctx, paths.root)("show", `${onto}:${basePath}`);
  if (ctx.fs.isRegularFile(join(paths.root, basePath))) {
    return { id, basePath, baseText, current: basePath };
  }
  const moved = findRecordFile(ctx, paths.recordsDir, id);
  const current = moved === undefined ? undefined : toPosix(relative(paths.root, moved));
  return { id, basePath, baseText, current };
}

/** HEAD's copy of a record, at its current path or its merge-base path. */
function atHead(
  git: (...args: string[]) => string,
  { basePath, current }: Located,
): { text: string; path: string } | undefined {
  for (const path of new Set([current, basePath])) {
    if (path === undefined) continue;
    const listed = gitOrEmpty(
      git,
      "--literal-pathspecs",
      "ls-tree",
      "--name-only",
      "HEAD",
      "--",
      path,
    );
    if (listed !== "") return { text: git("show", `HEAD:${path}`), path };
  }
  return undefined;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
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
 * at the merge-base, or at HEAD under `uncommitted`, keeping the rest of the current
 * frontmatter and the record's current folder. A deleted record is restored whole and staged.
 * Drafts are refused before anything is written. Returns the paths written.
 */
export function restoreDecisionProse(
  ctx: Context,
  { paths }: Project,
  base: string,
  ids: readonly string[],
  { uncommitted = false }: CheckOptions = {},
): string[] {
  const git = gitAt(ctx, paths.root);
  const records = integratedRecords(ctx, paths, base);
  const targets = ids.map((id) => {
    const located = locate(ctx, paths, records, id);
    if (located === undefined || isProposed(located.baseText, located.basePath)) {
      throw new DldError(`${id} is a draft (not on the base branch, or still proposed there).`);
    }
    const reference = uncommitted
      ? atHead(git, located)
      : { text: located.baseText, path: located.basePath };
    if (reference === undefined) throw new DldError(`${id} is not in HEAD; nothing to restore.`);
    return { located, reference };
  });
  return targets.map(({ located, reference }) => {
    const path = located.current ?? reference.path;
    const full = join(paths.root, path);
    const current = located.current === undefined ? undefined : recordHead(ctx.fs.readFile(full));
    const referenceHead = recordHead(reference.text);
    if (current === undefined || referenceHead === undefined) {
      writeFileAtomic(ctx, full, reference.text);
      if (located.current === undefined) git("--literal-pathspecs", "add", "--", path);
    } else {
      const eol = current.includes("\r\n") ? "\r\n" : "\n";
      const body = recordBody(reference.text).replace(/\r?\n/g, eol);
      writeFileAtomic(ctx, full, withLockedLines(current, referenceHead, eol) + body);
    }
    return path;
  });
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
  // Trailing whitespace at the end of the file (an editor's final newline) doesn't count.
  return `${fields}\n${recordBody(normalized).trimEnd()}`;
}

/** `head` with each locked key's line taken from `baseHead`, or added when it is missing. */
function withLockedLines(head: string, baseHead: string, eol: string): string {
  let result = head;
  for (const key of LOCKED_KEYS) {
    const pattern = new RegExp(`^${key}:[^\\r\\n]*`, "m");
    const line = baseHead.match(pattern)?.[0];
    if (line === undefined) continue;
    result = pattern.test(result)
      ? result.replace(pattern, () => line)
      : result.replace(/^---\r?\n/, (open) => `${open}${line}${eol}`);
  }
  return result;
}

/** `<path>\t<DL-NNN>\t<state>`, the command's line format. */
export function formatRecordEdit({ path, id, state }: RecordEdit): string {
  return `${path}\t${id}\t${state}`;
}
