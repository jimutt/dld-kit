import { basename, relative, sep } from "node:path";
import type { Context } from "./context.ts";
import { gitAt, nulSeparated, recordsPathspec, resolveStateCommit } from "./git.ts";
import type { Project } from "./project.ts";
import {
  formatTimestamp,
  listRecordFiles,
  parseRecord,
  recordBody,
  recordNumber,
} from "./records.ts";
import { readStateSection, shortHead, stateString, writeStateSection } from "./state.ts";

const MENTION = /DL-\d+/g;

export interface MissingAmend {
  source: string;
  referenced: string;
}

const toPosix = (path: string) => path.split(sep).join("/");
const idNumber = (id: string) => Number.parseInt(id.slice(3), 10);

/**
 * Record files (root-relative, `/`-separated) changed since the last audit, or undefined
 * when every record should be checked.
 */
function recordsChangedSinceAudit(ctx: Context, { paths }: Project): Set<string> | undefined {
  const git = gitAt(ctx, paths.root);
  const stored = stateString(readStateSection(ctx, paths, "audit"), "commit_hash");
  const commit = resolveStateCommit(git, stored);
  if (commit === undefined) return undefined;
  const records = recordsPathspec(paths);
  return new Set([
    ...nulSeparated(git("diff", "-z", "--name-only", commit, "--", records)),
    ...nulSeparated(git("ls-files", "-z", "--others", "--exclude-standard", "--", records)),
  ]);
}

// @decision(DL-024)
/**
 * Decision IDs a record's body mentions without declaring them in supersedes or amends.
 * Unless `all`, only records changed since the last audit are checked.
 */
export function findMissingAmends(
  ctx: Context,
  project: Project,
  { all }: { all: boolean },
): MissingAmend[] {
  const { paths } = project;
  const changed = all ? undefined : recordsChangedSinceAudit(ctx, project);
  const found: MissingAmend[] = [];
  const files = listRecordFiles(ctx, paths.recordsDir).sort(
    (a, b) => recordNumber(a) - recordNumber(b),
  );
  for (const file of files) {
    const rel = toPosix(relative(paths.root, file));
    if (changed !== undefined && !changed.has(rel)) continue;
    const text = ctx.fs.readFile(file);
    const record = parseRecord(text, rel);
    const source = basename(file, ".md");
    const declared = new Set([...record.supersedes, ...record.amends]);
    const mentioned = new Set(recordBody(text).match(MENTION) ?? []);
    const refs = [...mentioned]
      .filter((id) => id !== source && !declared.has(id))
      .sort((a, b) => idNumber(a) - idNumber(b));
    for (const referenced of refs) found.push({ source, referenced });
  }
  return found;
}

// @decision(DL-021)
/** Records the audit's time and commit. Returns them for reporting. */
export function updateAuditState(
  ctx: Context,
  { paths }: Project,
): { timestamp: string; commit: string } {
  const timestamp = formatTimestamp(ctx.now());
  const commit = shortHead(ctx, paths.root);
  writeStateSection(ctx, paths, "audit", { last_run: timestamp, commit_hash: commit });
  return { timestamp, commit };
}
