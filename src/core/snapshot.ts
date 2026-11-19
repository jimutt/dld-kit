import { basename, join, relative } from "node:path";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";
import { gitAt, gitOrEmpty, nulSeparated, recordsPathspec, resolveStateCommit } from "./git.ts";
import { compareIds, formatId, isDecisionId, parseId, recordFileId } from "./ids.ts";
import type { Project } from "./project.ts";
import { formatTimestamp, listRecordFiles, parseRecord, recordId } from "./records.ts";
import {
  readStateSection,
  type SectionValue,
  shortHead,
  stateString,
  writeStateSection,
} from "./state.ts";

export const DECISION_BOUNDARY = "===DLD_DECISION_BOUNDARY===";
// @decision(DL-084)
export const BUILT_IN_ARTIFACTS = ["OVERVIEW.md"] as const;

interface RecordFile {
  path: string;
  id: string;
  text: string;
  status: string;
}

/** Statuses a snapshot covers: accepted, and proposed shown apart as planned work. */
const isSnapshotted = (status: string) => status === "accepted" || status === "proposed";

function readRecords(ctx: Context, { paths }: Project): RecordFile[] {
  return listRecordFiles(ctx, paths.recordsDir)
    .map((path) => {
      const text = ctx.fs.readFile(path);
      const record = parseRecord(text, relative(paths.root, path));
      return { path, id: recordId(path), text, status: record.status };
    })
    .sort((a, b) => compareIds(a.id, b.id));
}

// @decision(DL-025) @decision(DL-070)
/** Every accepted record's content (and proposed, if asked), ascending by ID, separated by boundary lines. */
export function collectActiveDecisions(
  ctx: Context,
  project: Project,
  { includeProposed = false }: { includeProposed?: boolean } = {},
): string {
  if (!ctx.fs.isDirectory(project.paths.recordsDir)) {
    throw new DldError(`records directory not found at ${project.paths.recordsDir}`);
  }
  const wanted = includeProposed ? isSnapshotted : (status: string) => status === "accepted";
  return readRecords(ctx, project)
    .filter((record) => wanted(record.status))
    .map((record) => record.text)
    .join(`${DECISION_BOUNDARY}\n`);
}

export type SnapshotChanges =
  | { mode: "full" }
  | {
      mode: "incremental";
      newDecisions: string[];
      modifiedDecisions: string[];
      commitRange: string;
    };

// @decision(DL-097)
/**
 * The ID a stored `decisions_included` stands for: an ID as written since DL-097, or the
 * sequential ID with the bare number that earlier versions wrote. Undefined for anything else.
 */
function watermarkId(included: string | undefined): string | undefined {
  if (included === undefined) return undefined;
  if (/^\d+$/.test(included)) return formatId(Number.parseInt(included, 10));
  return isDecisionId(included) ? included : undefined;
}

// @decision(DL-097)
/**
 * Whether `id` comes after `watermark` in ID order. Sequential IDs compare by number alone, so
 * another spelling of the watermark's number is not past it.
 */
function isPast(id: string, watermark: string): boolean {
  const a = parseId(id);
  const b = parseId(watermark);
  if (a?.form === "sequential" && b?.form === "sequential") return a.number > b.number;
  return compareIds(id, watermark) > 0;
}

// @decision(DL-025) @decision(DL-070) @decision(DL-084) @decision(DL-097)
/** What changed since the last snapshot. */
export function detectSnapshotChanges(ctx: Context, project: Project): SnapshotChanges {
  const { paths } = project;
  const state = readStateSection(ctx, paths, "snapshot");
  if (state === undefined) return { mode: "full" };
  if (BUILT_IN_ARTIFACTS.some((name) => !ctx.fs.exists(join(paths.decisionsDir, name)))) {
    return { mode: "full" };
  }
  const watermark = watermarkId(stateString(state, "decisions_included"));
  if (watermark === undefined) return { mode: "full" };

  const git = gitAt(ctx, paths.root);
  let stored = stateString(state, "commit_hash");
  const lastRun = stateString(state, "last_run");
  if ((stored === undefined || stored === "unknown") && lastRun !== undefined) {
    stored = gitOrEmpty(git, "log", `--until=${lastRun}`, "--format=%h", "-1").trim() || undefined;
  }
  // Without a baseline the modified list cannot be trusted, so everything is regenerated.
  const commit = resolveStateCommit(git, stored);
  if (commit === undefined) return { mode: "full" };

  // A snapshot from before DL-070 left every proposed record out, wherever it is numbered.
  const proposedIncluded = stateString(state, "includes_proposed") === "true";
  const newDecisions = readRecords(ctx, project)
    .filter(
      (record) =>
        (isPast(record.id, watermark) && isSnapshotted(record.status)) ||
        (!proposedIncluded && record.status === "proposed"),
    )
    .map((record) => record.id);

  const records = recordsPathspec(paths);
  // Against the working tree, which is what the snapshot reads: committed and uncommitted
  // changes, and record files git does not track yet.
  const changed = [
    ...nulSeparated(gitOrEmpty(git, "diff", "-z", "--name-only", commit, "--", records)),
    ...nulSeparated(
      gitOrEmpty(git, "ls-files", "-z", "--others", "--exclude-standard", "--", records),
    ),
  ]
    .flatMap((path) => recordFileId(basename(path)) ?? [])
    .filter((id) => !isPast(id, watermark));
  const modifiedDecisions = [...new Set(changed)].sort(compareIds);
  const commitRange = commit === shortHead(ctx, paths.root) ? "" : `${commit}..HEAD`;
  return { mode: "incremental", newDecisions, modifiedDecisions, commitRange };
}

/** The lines detect-snapshot-changes.sh printed. */
export function formatSnapshotChanges(changes: SnapshotChanges): string {
  if (changes.mode === "full") return "mode: full\n";
  return [
    "mode: incremental",
    `new_decisions: ${changes.newDecisions.join(", ")}`,
    `modified_decisions: ${changes.modifiedDecisions.join(", ")}`,
    `commit_range: ${changes.commitRange}`,
    "",
  ].join("\n");
}

// @decision(DL-025) @decision(DL-021) @decision(DL-070) @decision(DL-084) @decision(DL-097)
/**
 * Records the snapshot run, the highest accepted or proposed ID and artifact timestamps.
 * `highest` is undefined when no record is accepted or proposed; the state then holds `0`.
 */
export function updateSnapshotState(
  ctx: Context,
  project: Project,
  customArtifacts: readonly string[],
): { timestamp: string; commit: string; highest: string | undefined } {
  const { paths } = project;
  const timestamp = formatTimestamp(ctx.now());
  const commit = shortHead(ctx, paths.root);
  const highest = readRecords(ctx, project)
    .filter((record) => isSnapshotted(record.status))
    .at(-1)?.id;
  // A null-prototype object, so an artifact named `__proto__` is stored like any other.
  const artifacts: SectionValue = Object.create(null);
  for (const name of [...BUILT_IN_ARTIFACTS, ...customArtifacts]) artifacts[name] = timestamp;
  writeStateSection(ctx, paths, "snapshot", {
    last_run: timestamp,
    commit_hash: commit,
    decisions_included: highest ?? "0",
    includes_proposed: "true",
    artifacts,
  });
  return { timestamp, commit, highest };
}
