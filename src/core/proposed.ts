import { basename, relative, sep } from "node:path";
import type { Context } from "./context.ts";
import { integratedRecords } from "./decision-edits.ts";
import type { Project } from "./project.ts";
import { listRecordFiles, parseRecord, recordNumber } from "./records.ts";
import { verifyBase } from "./reindex.ts";

export interface ProposedDecision {
  id: string;
  title: string;
  /** Root-relative, `/`-separated path. */
  path: string;
  /**
   * `branch` when the record's file does not exist at the merge-base, committed or not; `base`
   * when it does; `unknown` without a base to compare with.
   */
  location: "branch" | "base" | "unknown";
}

// @decision(DL-076) @decision(DL-090)
/**
 * Every `proposed` record, ascending by ID, marked by whether this branch added it, or as
 * `unknown` when there is no base.
 */
export function listProposed(
  ctx: Context,
  project: Project,
  base: string | undefined,
): ProposedDecision[] {
  const { paths } = project;
  if (base !== undefined) verifyBase(ctx, paths, base, " Fetch first or pass --base.");
  const atBase = base === undefined ? undefined : integratedRecords(ctx, paths, base).byId;
  return listRecordFiles(ctx, paths.recordsDir)
    .map((file) => {
      const path = relative(paths.root, file).split(sep).join("/");
      return { file, path, record: parseRecord(ctx.fs.readFile(file), path) };
    })
    .filter(({ record }) => record.status === "proposed")
    .sort((a, b) => recordNumber(a.file) - recordNumber(b.file))
    .map(({ file, path, record }) => {
      const id = basename(file, ".md");
      const location: ProposedDecision["location"] =
        atBase === undefined ? "unknown" : atBase.has(id) ? "base" : "branch";
      return { id, title: record.title, path, location };
    });
}

/** `<DL-NNN>\t<branch|base|unknown>\t<title>`, as list-proposed prints it. */
export function formatProposed({ id, title, location }: ProposedDecision): string {
  return `${id}\t${location}\t${title}`;
}
