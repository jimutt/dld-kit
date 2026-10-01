import { Buffer } from "node:buffer";
import { join, posix } from "node:path";
import { BINARY_SNIFF_BYTES, listScannableFiles, scanOptionsFor } from "./annotations.ts";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";
import { writeFileAtomic } from "./files.ts";
import { decisionsPathspec, gitAt, nulSeparated } from "./git.ts";
import type { Project, ProjectPaths } from "./project.ts";
import { parseRecord, setId } from "./records.ts";
import { mergeBase, type Rename, verifyBase } from "./reindex.ts";
import { parseRenamePlan, renameProblem } from "./rename-plan.ts";

/** `DL-NNN` not followed by another digit, so DL-100 does not match inside DL-1000. */
const idPattern = (id: string, flags = "") => new RegExp(`${id}(?![0-9])`, flags);

/**
 * Files changed since `commit` (the merge-base), committed or not (new paths of renames),
 * root-relative.
 */
function changedFiles(ctx: Context, paths: ProjectPaths, commit: string): string[] {
  return nulSeparated(
    gitAt(ctx, paths.root)(
      "diff",
      "-z",
      "--find-renames",
      "--name-only",
      "--diff-filter=AMR",
      commit,
    ),
  );
}

// @decision(DL-029)
/**
 * Applies `edit` to a regular, non-binary file's text and writes it back if it changed. The
 * text is decoded byte-for-byte (latin1), so bytes outside the edits survive whatever the
 * encoding, and the file mode is kept.
 */
function rewriteFile(ctx: Context, path: string, edit: (text: string) => string): void {
  if (!ctx.fs.isRegularFile(path)) return;
  const bytes = ctx.fs.readBytes(path);
  if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return;
  const text = Buffer.from(bytes).toString("latin1");
  const edited = edit(text);
  if (edited === text) return;
  writeFileAtomic(ctx, path, Buffer.from(edited, "latin1"), ctx.fs.fileMode(path));
}

// @decision(DL-029)
/**
 * Renames a locally added record from `oldId` to `newId` with `git mv`, then rewrites the old
 * ID in the record, in other changed files under the decisions directory, and in annotations
 * in changed files the annotation scanner reads. Returns the new root-relative path.
 */
export function renameDecision(
  ctx: Context,
  project: Project,
  rename: Rename,
  base: string,
): string {
  const { paths, config } = project;
  const { path, oldId, newId } = rename;
  const problem = renameProblem(paths, rename);
  if (problem !== undefined) throw new DldError(problem);
  const full = join(paths.root, path);
  if (!ctx.fs.isRegularFile(full)) throw new DldError(`${path} not found.`);
  const record = parseRecord(ctx.fs.readFile(full), path);
  if (record.id !== oldId) throw new DldError(`${path} has id ${record.id}, not ${oldId}.`);
  const newPath = posix.join(posix.dirname(path), `${newId}.md`);
  const newFull = join(paths.root, newPath);
  if (ctx.fs.lexists(newFull)) throw new DldError(`${newPath} already exists.`);
  verifyBase(ctx, paths, base);
  const since = mergeBase(ctx, paths, base);
  const scannable = new Set(listScannableFiles(ctx, scanOptionsFor(project)));

  gitAt(ctx, paths.root)("mv", "--", path, newPath);
  const substitute = (text: string) => text.replace(idPattern(oldId, "g"), newId);
  rewriteFile(ctx, newFull, (text) => substitute(setId(text, oldId, newId)));

  const decisions = `${decisionsPathspec(paths)}/`;
  const prefix = Buffer.from(config.annotationPrefix, "utf8").toString("latin1");
  const oldAnnotation = `${prefix}(${oldId})`;
  const newAnnotation = `${prefix}(${newId})`;
  for (const file of changedFiles(ctx, paths, since)) {
    if (file === newPath) continue;
    if (file.startsWith(decisions)) {
      rewriteFile(ctx, join(paths.root, file), substitute);
    } else if (scannable.has(file)) {
      rewriteFile(ctx, join(paths.root, file), (text) =>
        text.split(oldAnnotation).join(newAnnotation),
      );
    }
  }
  return newPath;
}

export interface StaleMention {
  file: string;
  line: number;
  oldId: string;
  newId: string;
  text: string;
}

// @decision(DL-029) @decision(DL-064)
/**
 * Remaining `DL-OLD` mentions, for each rename in the plan, in changed files outside the
 * decisions directory. Excluded and non-annotation text is included for the agent to judge.
 * An empty plan is an error, so a lost plan cannot pass as "nothing to review".
 */
export function findStaleMentions(
  ctx: Context,
  { paths }: Project,
  planText: string,
  base: string,
): StaleMention[] {
  const renames = parseRenamePlan(paths, planText);
  if (renames.length === 0) throw new DldError("no rename plan on stdin.");
  verifyBase(ctx, paths, base);
  const decisions = `${decisionsPathspec(paths)}/`;
  const files = changedFiles(ctx, paths, mergeBase(ctx, paths, base)).flatMap((file) => {
    if (file.startsWith(decisions)) return [];
    const full = join(paths.root, file);
    if (!ctx.fs.isRegularFile(full)) return [];
    const text = ctx.fs.readFile(full);
    if (text.slice(0, BINARY_SNIFF_BYTES).includes("\0")) return [];
    return [{ file, lines: text.split("\n").map((line) => line.replace(/\r$/, "")) }];
  });
  const found: StaleMention[] = [];
  for (const { oldId, newId } of renames) {
    const pattern = idPattern(oldId);
    for (const { file, lines } of files) {
      lines.forEach((text, index) => {
        if (pattern.test(text)) found.push({ file, line: index + 1, oldId, newId, text });
      });
    }
  }
  return found;
}

export function formatStaleMention({ file, line, oldId, newId, text }: StaleMention): string {
  return `${file}\t${line}\t${oldId}\t${newId}\t${text}`;
}
