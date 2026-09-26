import { join, relative } from "node:path";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";
import { createFileExclusive, writeFileAtomic } from "./files.ts";
import type { Project } from "./project.ts";
import {
  DECISION_ID,
  findRecordFile,
  formatTimestamp,
  renderNewRecord,
  type Status,
  setStatus,
} from "./records.ts";

// @decision(DL-014) @decision(DL-015)
/** Sets a decision's status. Returns the record's path. */
export function updateStatus(ctx: Context, project: Project, id: string, status: Status): string {
  const path = findRecordFile(ctx, project.paths.recordsDir, id);
  if (path === undefined) throw new DldError(`decision ${id} not found.`);
  const text = ctx.fs.readFile(path);
  writeFileAtomic(ctx, path, setStatus(text, status, relative(project.paths.root, path)));
  return path;
}

export interface CreateDecisionInput {
  id: string;
  title: string;
  namespace?: string;
  tags: string;
  supersedes: string;
  amends: string;
  body: string;
}

// @decision(DL-014) @decision(DL-015) @decision(DL-016)
/** Writes a new proposed record and returns its path. */
export function createDecision(ctx: Context, project: Project, input: CreateDecisionInput): string {
  if (!DECISION_ID.test(input.id)) {
    throw new DldError(`invalid decision ID '${input.id}'; expected DL-<digits>, e.g. DL-001.`);
  }
  const namespaced = project.config.mode === "namespaced" && input.namespace !== undefined;
  if (namespaced && !isSafeDirName(input.namespace ?? "")) {
    throw new DldError(`invalid namespace '${input.namespace}'.`);
  }
  const dir = namespaced
    ? join(project.paths.recordsDir, input.namespace ?? "")
    : project.paths.recordsDir;
  ctx.fs.mkdir(dir);
  const path = join(dir, `${input.id}.md`);
  const content = renderNewRecord({
    id: input.id,
    title: input.title,
    timestamp: formatTimestamp(ctx.now()),
    ...(namespaced && input.namespace !== undefined ? { namespace: input.namespace } : {}),
    tags: input.tags,
    supersedes: input.supersedes,
    amends: input.amends,
    body: input.body,
  });
  createFileExclusive(ctx, path, content, `${path} already exists.`);
  return path;
}

function isSafeDirName(name: string): boolean {
  return name !== "" && name !== "." && name !== ".." && !/[/\\]/.test(name);
}
