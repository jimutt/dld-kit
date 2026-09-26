import { join, posix } from "node:path";
import type { Context } from "./context.ts";
import { DldError, GitCommandError } from "./errors.ts";
import { writeFileAtomic } from "./files.ts";
import { decisionsPathspec, gitAt, nulSeparated } from "./git.ts";
import type { Project } from "./project.ts";
import { mergeBase, type Rename, verifyBase } from "./reindex.ts";
import { parseRenamePlan } from "./rename-plan.ts";

const SUBJECT_LIST_LIMIT = 3;

export interface ReindexCommit {
  /** Short hash of the new commit and of the merge-base it sits on. */
  commit: string;
  onto: string;
}

/** The squashed commit's message: renames in the subject, then the original subjects. */
export function reindexMessage(renames: readonly Rename[], originalSubjects: string): string {
  const pairs = renames.map(({ oldId, newId }) => `${oldId} -> ${newId}`);
  const subject =
    renames.length > SUBJECT_LIST_LIMIT
      ? `reindex ${renames.length} local decisions to avoid base-branch collisions`
      : `reindex local decisions: ${pairs.join(", ")}`;
  const message = `${subject}\n\nRenames:\n${pairs.map((pair) => `- ${pair}`).join("\n")}`;
  return originalSubjects === ""
    ? message
    : `${message}\n\nSquashed from original branch commits:\n${originalSubjects}`;
}

interface SavedState {
  head: string;
  tree: string;
  /** The INDEX.md working copy, or undefined if there was none. */
  index: { bytes: Uint8Array; mode: number } | undefined;
}

// @decision(DL-030)
/**
 * Squashes the branch's commits since the merge-base with `base` into one commit holding the
 * renamed records and every other file the branch changed, except INDEX.md, which is left at
 * its merge-base state. If anything fails after HEAD moves, HEAD, the index and INDEX.md are
 * restored.
 */
export function commitReindex(
  ctx: Context,
  { paths }: Project,
  planText: string,
  base: string,
): ReindexCommit {
  const git = gitAt(ctx, paths.root);
  verifyBase(ctx, paths, base);
  const renames = parseRenamePlan(paths, planText);
  if (renames.length === 0) throw new DldError("no rename plan on stdin.");

  const onto = mergeBase(ctx, paths, base);
  const head = git("rev-parse", "HEAD").trim();
  if (onto === head) throw new DldError("HEAD is already at the merge-base — nothing to squash.");

  const indexRel = posix.join(decisionsPathspec(paths), "INDEX.md");
  const branchFiles = nulSeparated(
    git("diff", "-z", "--no-renames", "--name-only", "--diff-filter=AMRD", `${onto}..HEAD`),
  );
  const stage = new Set<string>();
  for (const { path, newId } of renames) {
    stage.add(path);
    stage.add(posix.join(posix.dirname(path), `${newId}.md`));
  }
  for (const file of branchFiles) if (file !== indexRel) stage.add(file);

  const subjects = git("log", "--reverse", "--format=- %s", `${onto}..HEAD`).replace(/\n+$/, "");
  const message = reindexMessage(renames, subjects);

  const indexFull = join(paths.root, indexRel);
  if (ctx.fs.lexists(indexFull) && !ctx.fs.isRegularFile(indexFull)) {
    throw new DldError(`${indexRel} is not a regular file.`);
  }
  const saved: SavedState = {
    head,
    tree: git("write-tree").trim(),
    index: ctx.fs.isRegularFile(indexFull)
      ? { bytes: ctx.fs.readBytes(indexFull), mode: ctx.fs.fileMode(indexFull) }
      : undefined,
  };

  let stepName = "resetting to the merge-base";
  const step = <T>(name: string, run: () => T): T => {
    stepName = name;
    return run();
  };
  try {
    step("resetting to the merge-base", () => git("reset", "--quiet", onto));
    step(`restoring ${indexRel}`, () => {
      if (existsAtHead(git, indexRel)) {
        git("--literal-pathspecs", "checkout", "HEAD", "--", indexRel);
      } else {
        ctx.fs.remove(indexFull);
      }
    });
    for (const path of [...stage].sort()) {
      step(`staging ${path}`, () => stagePath(ctx, git, join(paths.root, path), path));
    }
    step("checking the staged changes", () => {
      if (!hasStagedChanges(git)) {
        throw new DldError(
          "nothing to commit after squash. The reindex may have already been applied, or the plan didn't match the branch state.",
        );
      }
    });
    step("committing", () => {
      try {
        git("commit", "--quiet", "-m", message);
      } catch (error) {
        // The arguments include the whole message; report git's own output instead.
        if (error instanceof GitCommandError)
          throw new DldError(`git commit failed: ${error.stderr}`);
        throw error;
      }
    });
  } catch (error) {
    throw rollback(ctx, git, indexFull, saved, stepName, error);
  }
  return {
    commit: git("rev-parse", "--short", "HEAD").trim(),
    onto: git("rev-parse", "--short", onto).trim(),
  };
}

function existsAtHead(git: (...args: string[]) => string, path: string): boolean {
  return git("--literal-pathspecs", "ls-tree", "-z", "HEAD", "--", path) !== "";
}

/**
 * Stages additions, changes and deletions of one path. A path that is neither in the working
 * tree nor in the index (a renamed record's old path) is skipped.
 */
function stagePath(
  ctx: Context,
  git: (...args: string[]) => string,
  full: string,
  path: string,
): void {
  const known =
    ctx.fs.lexists(full) || git("--literal-pathspecs", "ls-files", "-z", "--", path) !== "";
  if (known) git("--literal-pathspecs", "add", "-A", "--", path);
}

function hasStagedChanges(git: (...args: string[]) => string): boolean {
  try {
    git("diff", "--cached", "--quiet");
    return false;
  } catch (error) {
    if (error instanceof GitCommandError && error.status === 1) return true;
    throw error;
  }
}

// @decision(DL-030)
/** Puts HEAD, the index and INDEX.md back as saved, and returns the error to report. */
function rollback(
  ctx: Context,
  git: (...args: string[]) => string,
  indexFull: string,
  saved: SavedState,
  stepName: string,
  cause: unknown,
): unknown {
  try {
    git("reset", "--quiet", "--soft", saved.head);
    git("read-tree", saved.tree);
    if (saved.index === undefined) ctx.fs.remove(indexFull);
    else writeFileAtomic(ctx, indexFull, saved.index.bytes, saved.index.mode);
  } catch (rollbackError) {
    return new DldError(
      `commit-reindex failed while ${stepName}: ${describe(cause)}\n` +
        `Rolling back also failed: ${describe(rollbackError)}\n` +
        `To restore by hand: git reset --soft ${saved.head} && git read-tree ${saved.tree}`,
    );
  }
  if (!(cause instanceof DldError)) return cause;
  return new DldError(
    `commit-reindex failed while ${stepName}: ${cause.message}\n` +
      `The branch was restored to ${saved.head}.`,
    cause.exitCode,
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
