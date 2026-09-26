import { basename, join, relative, sep } from "node:path";
import type { Context } from "./context.ts";
import { DldError, GitCommandError } from "./errors.ts";
import { formatId } from "./ids.ts";
import type { Project } from "./project.ts";
import {
  formatTimestamp,
  listRecordFiles,
  parseRecord,
  RECORD_FILE,
  recordNumber,
} from "./records.ts";
import {
  readStateSection,
  type SectionValue,
  shortHead,
  stateString,
  writeStateSection,
} from "./state.ts";

export const DECISION_BOUNDARY = "===DLD_DECISION_BOUNDARY===";
export const BUILT_IN_ARTIFACTS = ["SNAPSHOT.md", "OVERVIEW.md"] as const;

interface RecordFile {
  path: string;
  number: number;
  text: string;
  accepted: boolean;
}

function readRecords(ctx: Context, { paths }: Project): RecordFile[] {
  return listRecordFiles(ctx, paths.recordsDir)
    .map((path) => {
      const text = ctx.fs.readFile(path);
      const record = parseRecord(text, relative(paths.root, path));
      return { path, number: recordNumber(path), text, accepted: record.status === "accepted" };
    })
    .sort((a, b) => a.number - b.number);
}

// @decision(DL-025)
/** Every accepted record's content, ascending by ID, separated by boundary lines. */
export function collectActiveDecisions(ctx: Context, project: Project): string {
  if (!ctx.fs.isDirectory(project.paths.recordsDir)) {
    throw new DldError(`records directory not found at ${project.paths.recordsDir}`);
  }
  return readRecords(ctx, project)
    .filter((record) => record.accepted)
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

// @decision(DL-025)
/** What changed since the last snapshot, as detect-snapshot-changes.sh reported it. */
export function detectSnapshotChanges(ctx: Context, project: Project): SnapshotChanges {
  const { paths } = project;
  const state = readStateSection(ctx, paths, "snapshot");
  if (state === undefined) return { mode: "full" };
  if (BUILT_IN_ARTIFACTS.some((name) => !ctx.fs.exists(join(paths.decisionsDir, name)))) {
    return { mode: "full" };
  }
  const included = stateString(state, "decisions_included");
  if (included === undefined || !/^\d+$/.test(included)) return { mode: "full" };
  const includedNumber = Number.parseInt(included, 10);

  const newDecisions = readRecords(ctx, project)
    .filter((record) => record.number > includedNumber && record.accepted)
    .map((record) => formatId(record.number));

  const git = (...args: string[]) => ctx.git(["-C", paths.root, ...args]);
  let commit = stateString(state, "commit_hash");
  const lastRun = stateString(state, "last_run");
  if ((commit === undefined || commit === "unknown") && lastRun !== undefined) {
    commit = gitOrEmpty(git, "log", `--until=${lastRun}`, "--format=%h", "-1").trim() || undefined;
  }

  let modifiedDecisions: string[] = [];
  let commitRange = "";
  if (commit !== undefined && commit !== "unknown" && commitExists(git, commit)) {
    if (commit !== shortHead(ctx, paths.root)) {
      commitRange = `${commit}..HEAD`;
      const records = relative(paths.root, paths.recordsDir).split(sep).join("/");
      const numbers = gitOrEmpty(git, "diff", "--name-only", commitRange, "--", records)
        .split("\n")
        .map((path) => basename(path))
        .filter((name) => RECORD_FILE.test(name))
        .map((name) => recordNumber(name))
        .filter((number) => number <= includedNumber);
      modifiedDecisions = [...new Set(numbers)].sort((a, b) => a - b).map(formatId);
    }
  }
  return { mode: "incremental", newDecisions, modifiedDecisions, commitRange };
}

/** Runs git, treating a failure as empty output (the scripts used `|| true`). */
function gitOrEmpty(git: (...args: string[]) => string, ...args: string[]): string {
  try {
    return git(...args);
  } catch (error) {
    if (error instanceof GitCommandError) return "";
    throw error;
  }
}

function commitExists(git: (...args: string[]) => string, commit: string): boolean {
  try {
    git("cat-file", "-t", commit);
    return true;
  } catch (error) {
    if (error instanceof GitCommandError) return false;
    throw error;
  }
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

// @decision(DL-025) @decision(DL-021)
/** Records the snapshot run, the highest accepted ID and artifact timestamps. */
export function updateSnapshotState(
  ctx: Context,
  project: Project,
  customArtifacts: readonly string[],
): { timestamp: string; commit: string; highest: number } {
  const { paths } = project;
  const timestamp = formatTimestamp(ctx.now());
  const commit = shortHead(ctx, paths.root);
  const highest = readRecords(ctx, project)
    .filter((record) => record.accepted)
    .reduce((max, record) => Math.max(max, record.number), 0);
  const artifacts: SectionValue = {};
  for (const name of [...BUILT_IN_ARTIFACTS, ...customArtifacts]) artifacts[name] = timestamp;
  writeStateSection(ctx, paths, "snapshot", {
    last_run: timestamp,
    commit_hash: commit,
    decisions_included: String(highest),
    artifacts,
  });
  return { timestamp, commit, highest };
}
