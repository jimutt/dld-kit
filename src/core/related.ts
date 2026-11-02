import { basename, relative, sep } from "node:path";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";
import type { Project } from "./project.ts";
import { DECISION_ID, findRecordFile, listRecordFiles, parseRecord } from "./records.ts";

export const RELATIONS = ["amends", "supersedes", "amended-by", "superseded-by"] as const;
export type Relation = (typeof RELATIONS)[number];

export interface RelatedDecision {
  relation: Relation;
  id: string;
  /** The related record's status, or `missing` when no record has that ID. */
  status: string;
  title: string;
}

/** The ID's number, or Infinity for a value that is not a decision ID, so it sorts last. */
const idNumber = (id: string) =>
  DECISION_ID.test(id) ? Number.parseInt(id.slice(3), 10) : Number.POSITIVE_INFINITY;

// @decision(DL-077)
/**
 * The decisions related to `id`: those it amends or supersedes, from its own frontmatter, and
 * those whose `amends` or `supersedes` list it. Ascending by ID, then by relation.
 */
export function relatedDecisions(ctx: Context, project: Project, id: string): RelatedDecision[] {
  const { paths } = project;
  const targetFile = findRecordFile(ctx, paths.recordsDir, id, paths.root);
  if (targetFile === undefined) throw new DldError(`decision ${id} not found.`);
  const records = listRecordFiles(ctx, paths.recordsDir).map((file) => {
    const path = relative(paths.root, file).split(sep).join("/");
    return { file, id: basename(file, ".md"), record: parseRecord(ctx.fs.readFile(file), path) };
  });
  const byId = new Map(records.map((entry) => [entry.id, entry.record]));
  const target = records.find((entry) => entry.file === targetFile)?.record;
  if (target === undefined) throw new DldError(`decision ${id} not found.`);

  const related: RelatedDecision[] = [];
  const add = (relation: Relation, other: string) => {
    const record = byId.get(other);
    related.push({
      relation,
      id: other,
      status: record?.status ?? "missing",
      title: record?.title ?? "",
    });
  };
  for (const other of target.amends) add("amends", other);
  for (const other of target.supersedes) add("supersedes", other);
  for (const entry of records) {
    if (entry.file === targetFile) continue;
    if (entry.record.amends.includes(id)) add("amended-by", entry.id);
    if (entry.record.supersedes.includes(id)) add("superseded-by", entry.id);
  }
  return related.sort(
    (a, b) =>
      idNumber(a.id) - idNumber(b.id) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) ||
      RELATIONS.indexOf(a.relation) - RELATIONS.indexOf(b.relation),
  );
}

/** `<relation>\t<DL-NNN>\t<status>\t<title>`, as related-decisions prints it. */
export function formatRelated({ relation, id, status, title }: RelatedDecision): string {
  return `${relation}\t${id}\t${status}\t${title}`;
}
