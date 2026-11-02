import { join, relative } from "node:path";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";
import { createFileExclusive, writeFileAtomic } from "./files.ts";
import { formatId, isCanonicalId } from "./ids.ts";
import type { Project } from "./project.ts";
import {
  DECISION_ID,
  findRecordFile,
  formatTimestamp,
  listRecordFiles,
  recordNumber,
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

const EXIT_USAGE = 2;

// @decision(DL-014) @decision(DL-015) @decision(DL-016) @decision(DL-078) @decision(DL-080)
/** Writes a new proposed record and returns its path. */
export function createDecision(ctx: Context, project: Project, input: CreateDecisionInput): string {
  if (!DECISION_ID.test(input.id)) {
    throw new DldError(
      `invalid decision ID '${input.id}'; expected DL-<digits>, e.g. DL-001.`,
      EXIT_USAGE,
    );
  }
  const number = Number.parseInt(input.id.slice(3), 10);
  if (!isCanonicalId(input.id)) {
    throw new DldError(
      `decision ID '${input.id}' is not canonical; use ${formatId(number)}.`,
      EXIT_USAGE,
    );
  }
  const { config } = project;
  if (input.namespace !== undefined) {
    if (config.mode !== "namespaced") {
      throw new DldError("--namespace is only valid in a namespaced project.", EXIT_USAGE);
    }
    if (!config.namespaces.includes(input.namespace) || !isSafeDirName(input.namespace)) {
      throw new DldError(
        `unknown namespace '${input.namespace}'; configured namespaces: ${config.namespaces.join(", ")}.`,
        EXIT_USAGE,
      );
    }
  }
  const existing = listRecordFiles(ctx, project.paths.recordsDir).find(
    (path) => recordNumber(path) === number,
  );
  if (existing !== undefined) {
    throw new DldError(
      `decision ${input.id} already exists: ${relative(project.paths.root, existing)}`,
    );
  }
  const namespaced = input.namespace !== undefined;
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
  return name !== "." && name !== ".." && /^[A-Za-z0-9._-]+$/.test(name);
}
