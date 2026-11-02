import { basename, relative, sep } from "node:path";
import type { Context } from "./context.ts";
import { integratedRecords } from "./decision-edits.ts";
import type { Project } from "./project.ts";
import { listRecordFiles, parseRecord, recordNumber } from "./records.ts";

export interface ProposedDecision {
  id: string;
  title: string;
  /** Root-relative, `/`-separated path. */
  path: string;
  /** True when the record's file does not exist at the merge-base, committed or not. */
  addedOnBranch: boolean;
}

// @decision(DL-076)
/** Every `proposed` record, ascending by ID, marked by whether this branch added it. */
export function listProposed(ctx: Context, project: Project, base: string): ProposedDecision[] {
  const { paths } = project;
  const atBase = integratedRecords(ctx, paths, base).byId;
  return listRecordFiles(ctx, paths.recordsDir)
    .map((file) => {
      const path = relative(paths.root, file).split(sep).join("/");
      return { file, path, record: parseRecord(ctx.fs.readFile(file), path) };
    })
    .filter(({ record }) => record.status === "proposed")
    .sort((a, b) => recordNumber(a.file) - recordNumber(b.file))
    .map(({ file, path, record }) => {
      const id = basename(file, ".md");
      return { id, title: record.title, path, addedOnBranch: !atBase.has(id) };
    });
}

/** `<DL-NNN>\t<branch|base>\t<title>`, as list-proposed prints it. */
export function formatProposed({ id, title, addedOnBranch }: ProposedDecision): string {
  return `${id}\t${addedOnBranch ? "branch" : "base"}\t${title}`;
}
