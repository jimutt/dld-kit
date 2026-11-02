import { basename, relative, sep } from "node:path";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";
import { gitAt, nulSeparated, recordsPathspec, resolveStateCommit } from "./git.ts";
import { type MentionTier, mentionTiers } from "./mentions.ts";
import type { Project } from "./project.ts";
import {
  formatTimestamp,
  listRecordFiles,
  parseRecord,
  recordBody,
  recordNumber,
} from "./records.ts";
import { readStateSection, shortHead, stateString, writeStateSection } from "./state.ts";

export interface MissingAmend {
  source: string;
  referenced: string;
  tier: MentionTier;
}

export interface MissingAmendsOptions {
  /** Check every record, not only those changed since the last audit. */
  all?: boolean;
  /** Include the `mention` tier. */
  mentions?: boolean;
  /** Check only these records, whatever the audit state. */
  ids?: readonly string[];
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

// @decision(DL-024) @decision(DL-082)
/**
 * Decision IDs a record's body mentions without declaring them in supersedes or amends, each
 * with its tier. Plain mentions only with `mentions`. Unless `all` or `ids`, only records
 * changed since the last audit are checked.
 */
export function findMissingAmends(
  ctx: Context,
  project: Project,
  { all = false, mentions = false, ids }: MissingAmendsOptions,
): MissingAmend[] {
  const { paths } = project;
  const files = listRecordFiles(ctx, paths.recordsDir).sort(
    (a, b) => recordNumber(a) - recordNumber(b),
  );
  let include: (file: string, rel: string) => boolean = () => true;
  if (ids !== undefined) {
    const wanted = new Set(ids);
    for (const id of wanted) {
      if (!files.some((file) => basename(file, ".md") === id)) {
        throw new DldError(`decision ${id} not found.`);
      }
    }
    include = (file) => wanted.has(basename(file, ".md"));
  } else if (!all) {
    const changed = recordsChangedSinceAudit(ctx, project);
    if (changed !== undefined) include = (_, rel) => changed.has(rel);
  }
  const found: MissingAmend[] = [];
  for (const file of files) {
    const rel = toPosix(relative(paths.root, file));
    if (!include(file, rel)) continue;
    const text = ctx.fs.readFile(file);
    const record = parseRecord(text, rel);
    const source = basename(file, ".md");
    const declared = new Set([...record.supersedes, ...record.amends]);
    const refs = [...mentionTiers(recordBody(text))]
      .filter(
        ([id, tier]) => id !== source && !declared.has(id) && (mentions || tier !== "mention"),
      )
      .sort(([a], [b]) => idNumber(a) - idNumber(b));
    for (const [referenced, tier] of refs) found.push({ source, referenced, tier });
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
