import { basename, join, relative, sep } from "node:path";
import type { Mode } from "./config.ts";
import type { Context } from "./context.ts";
import { DldError, GitCommandError } from "./errors.ts";
import { writeFileAtomic } from "./files.ts";
import type { ProjectPaths } from "./project.ts";
import {
  type DecisionRecord,
  listRecordFiles,
  parseRecord,
  RECORD_FILE,
  recordNumber,
} from "./records.ts";

export const INDEX_FILE = "INDEX.md";

interface IndexRow {
  number: number;
  record: DecisionRecord;
}

// @decision(DL-018)
/** INDEX.md content for the given rows, in the layout regenerate-index.sh writes. */
export function renderIndex(rows: readonly IndexRow[], mode: Mode): string {
  const namespaced = mode === "namespaced";
  const lines = [
    "# Decision Log",
    "",
    namespaced ? "| ID | Title | Status | Namespace | Tags |" : "| ID | Title | Status | Tags |",
    namespaced ? "|----|-------|--------|-----------|------|" : "|----|-------|--------|------|",
  ];
  const sorted = [...rows].sort((a, b) => b.number - a.number);
  for (const { record } of sorted) {
    const cells = [record.id, record.title, record.status];
    if (namespaced) cells.push(record.namespace ?? "");
    cells.push(record.tags.join(", "));
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

export function indexPath(paths: ProjectPaths): string {
  return join(paths.decisionsDir, INDEX_FILE);
}

// @decision(DL-018)
/**
 * Rows for every local record, plus — with `includeBase` — records that exist only on that
 * git ref (matched by file name).
 */
export function collectIndexRows(
  ctx: Context,
  paths: ProjectPaths,
  includeBase?: string,
): IndexRow[] {
  const localFiles = listRecordFiles(ctx, paths.recordsDir);
  const rows = localFiles.map((path) => ({
    number: recordNumber(path),
    record: parseRecord(ctx.fs.readFile(path), relative(paths.root, path)),
  }));
  if (includeBase === undefined) return rows;

  const git = (...args: string[]) => ctx.git(["-C", paths.root, ...args]);
  try {
    git("rev-parse", "--verify", "--quiet", `${includeBase}^{commit}`);
  } catch (error) {
    if (error instanceof GitCommandError) {
      throw new DldError(`--include-base ref '${includeBase}' not found.`);
    }
    throw error;
  }
  const localNames = new Set(localFiles.map((path) => basename(path)));
  const recordsRel = relative(paths.root, paths.recordsDir).split(sep).join("/");
  const basePaths = git("ls-tree", "-r", "--name-only", includeBase, "--", recordsRel)
    .split("\n")
    .filter((path) => RECORD_FILE.test(basename(path)) && !localNames.has(basename(path)));
  for (const path of basePaths) {
    rows.push({
      number: recordNumber(path),
      record: parseRecord(git("show", `${includeBase}:${path}`), `${includeBase}:${path}`),
    });
  }
  return rows;
}

export function writeIndex(ctx: Context, paths: ProjectPaths, content: string): void {
  writeFileAtomic(ctx, indexPath(paths), content);
}
