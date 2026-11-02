import { join } from "node:path";
import { parseDocument } from "yaml";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";

export const CONFIG_FILE = "dld.config.yaml";

export type Mode = "flat" | "namespaced";

/** How strictly the prose of integrated decision records is protected (DL-067). */
export const DECISION_EDITS = ["block", "ask", "allow"] as const;
export type DecisionEdits = (typeof DECISION_EDITS)[number];

export interface SnapshotArtifact {
  title: string;
  prompt: string;
}

export interface Config {
  decisionsDir: string;
  mode: Mode;
  namespaces: string[];
  annotationPrefix: string;
  /** git glob patterns excluded from annotation scanning. */
  annotationExclude: string[];
  implementReview: boolean;
  decisionEdits: DecisionEdits;
  snapshotArtifacts: SnapshotArtifact[];
  /** The branch decisions are checked against, when set (DL-071). */
  baseBranch?: string;
}

// @decision(DL-079)
/** Every top-level key of the configuration spec. */
export const CONFIG_KEYS = [
  "decisions_dir",
  "mode",
  "namespaces",
  "annotation_prefix",
  "annotation_exclude",
  "implement_review",
  "decision_edits",
  "snapshot_artifacts",
  "base_branch",
] as const;

export function loadConfig(ctx: Context, root: string): Config {
  const path = join(root, CONFIG_FILE);
  if (!ctx.fs.exists(path)) {
    throw new DldError(`${CONFIG_FILE} not found. Run /dld-init first.`);
  }
  return parseConfig(ctx.fs.readFile(path), (message) => ctx.warn(message));
}

// @decision(DL-009) @decision(DL-079)
/** Parses and validates the config; `warn` receives one message per unknown key. */
export function parseConfig(text: string, warn: (message: string) => void = () => {}): Config {
  // logLevel "silent": problems are reported through doc.errors/doc.warnings, never printed.
  const doc = parseDocument(text, { logLevel: "silent" });
  const problem = doc.errors[0] ?? doc.warnings[0];
  if (problem !== undefined) throw invalid(`not valid YAML: ${problem.message}`);
  const raw: unknown = doc.toJS();
  if (!isRecord(raw)) throw invalid("expected a mapping of keys to values");
  for (const key of Object.keys(raw)) {
    if (!CONFIG_KEYS.some((known) => known === key)) warn(unknownKeyMessage(key));
  }

  const mode = raw.mode;
  if (mode !== "flat" && mode !== "namespaced") {
    throw invalid("'mode' must be 'flat' or 'namespaced'");
  }
  const namespaces = optionalStringList(raw.namespaces, "namespaces");
  if (mode === "namespaced" && namespaces.length === 0) {
    throw invalid("'namespaces' must list at least one namespace when 'mode' is 'namespaced'");
  }

  return {
    decisionsDir: requiredString(raw.decisions_dir, "decisions_dir"),
    mode,
    namespaces,
    annotationPrefix: optionalString(raw.annotation_prefix, "annotation_prefix") ?? "@decision",
    // @decision(DL-023)
    annotationExclude: repoRelativePatterns(raw.annotation_exclude, "annotation_exclude"),
    implementReview: optionalBoolean(raw.implement_review, "implement_review") ?? true,
    decisionEdits: decisionEdits(raw.decision_edits),
    snapshotArtifacts: snapshotArtifacts(raw.snapshot_artifacts),
    ...optionalBaseBranch(raw.base_branch),
  };
}

function unknownKeyMessage(key: string): string {
  const close = CONFIG_KEYS.filter((known) => editDistance(key, known) <= 2);
  const hint = close[0] === undefined ? "" : `; did you mean '${close[0]}'?`;
  return `${CONFIG_FILE}: unknown key '${key}'${hint}`;
}

/** Levenshtein distance. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

// @decision(DL-071)
function optionalBaseBranch(value: unknown): { baseBranch?: string } {
  const branch = optionalString(value, "base_branch");
  if (branch === undefined) return {};
  if (branch.startsWith("-") || /\s|\.\.|^\/|\/$|^origin\//.test(branch)) {
    throw invalid(
      `'base_branch' must be a branch name such as main or develop, without origin/, got '${branch}'`,
    );
  }
  return { baseBranch: branch };
}

function invalid(message: string): DldError {
  return new DldError(`${CONFIG_FILE}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, key: string): string {
  const result = optionalString(value, key);
  if (result === undefined) throw invalid(`'${key}' is required`);
  return result;
}

function optionalString(value: unknown, key: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid(`'${key}' must be a non-empty string`);
  }
  return value;
}

function optionalBoolean(value: unknown, key: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw invalid(`'${key}' must be true or false`);
  return value;
}

function optionalStringList(value: unknown, key: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid(`'${key}' must be a list of strings`);
  return value.map((item) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw invalid(`'${key}' must be a list of non-empty strings`);
    }
    return item;
  });
}

/** Patterns must stay inside the repository; git rejects anything else at scan time. */
function repoRelativePatterns(value: unknown, key: string): string[] {
  const patterns = optionalStringList(value, key);
  const outside = patterns.find((pattern) => /^([/\\]|[A-Za-z]:|\.\.([/\\]|$))/.test(pattern));
  if (outside !== undefined) {
    throw invalid(`'${key}' patterns must be relative to the repository root, got '${outside}'`);
  }
  return patterns;
}

// @decision(DL-067)
function decisionEdits(value: unknown): DecisionEdits {
  if (value === undefined || value === null) return "block";
  const allowed: readonly unknown[] = DECISION_EDITS;
  if (!allowed.includes(value)) {
    throw invalid(`'decision_edits' must be one of ${DECISION_EDITS.join(", ")}`);
  }
  return value as DecisionEdits;
}

function snapshotArtifacts(value: unknown): SnapshotArtifact[] {
  const key = "snapshot_artifacts";
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid(`'${key}' must be a list of {title, prompt} entries`);
  return value.map((item) => {
    if (!isRecord(item)) throw invalid(`'${key}' entries must have 'title' and 'prompt'`);
    return {
      title: requiredString(item.title, `${key}[].title`),
      prompt: requiredString(item.prompt, `${key}[].prompt`),
    };
  });
}
