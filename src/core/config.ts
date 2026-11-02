import { join } from "node:path";
import { parseDocument } from "yaml";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";

export const CONFIG_FILE = "dld.config.yaml";
/** One developer's settings for a checkout, never committed (DL-087). */
export const LOCAL_FILE = "dld.local.yaml";

export type Mode = "flat" | "namespaced";

/** How strictly the prose of integrated decision records is protected (DL-067). */
export const DECISION_EDITS = ["block", "ask", "allow"] as const;
export type DecisionEdits = (typeof DECISION_EDITS)[number];

export interface SnapshotArtifact {
  title: string;
  prompt: string;
}

// @decision(DL-087) @decision(DL-088) @decision(DL-089)
/** Settings `dld.local.yaml` may override; unset ones are undefined. */
export interface PersonalSettings {
  implementReview?: boolean;
  planReview?: boolean;
  reviewModel?: string;
  implementReviewModel?: string;
  planReviewModel?: string;
}

/** The keys of `PersonalSettings`, as written in the YAML files. */
export const PERSONAL_KEYS = [
  "implement_review",
  "plan_review",
  "review_model",
  "implement_review_model",
  "plan_review_model",
] as const;

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
  /** The review settings as `dld.config.yaml` sets them, before `dld.local.yaml`. */
  personal: PersonalSettings;
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
  "plan_review",
  "review_model",
  "implement_review_model",
  "plan_review_model",
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

// @decision(DL-009) @decision(DL-079) @decision(DL-085)
/**
 * Parses and validates the config; `warn` receives one message per unknown key. Keys
 * starting with `x-` are the project's own and never warn.
 */
export function parseConfig(text: string, warn: (message: string) => void = () => {}): Config {
  // logLevel "silent": problems are reported through doc.errors/doc.warnings, never printed.
  const doc = parseDocument(text, { logLevel: "silent" });
  const problem = doc.errors[0] ?? doc.warnings[0];
  if (problem !== undefined) throw invalid(`not valid YAML: ${problem.message}`);
  const raw: unknown = doc.toJS();
  if (!isRecord(raw)) throw invalid("expected a mapping of keys to values");
  for (const key of Object.keys(raw)) {
    if (key.startsWith("x-") || CONFIG_KEYS.some((known) => known === key)) continue;
    warn(unknownKeyMessage(key, CONFIG_FILE, CONFIG_KEYS));
  }

  const mode = raw.mode;
  if (mode !== "flat" && mode !== "namespaced") {
    throw invalid("'mode' must be 'flat' or 'namespaced'");
  }
  const namespaces = optionalStringList(raw.namespaces, "namespaces");
  // @decision(DL-080)
  const unsafe = namespaces.find((name) => !/^[A-Za-z0-9._-]+$/.test(name) || /^\.\.?$/.test(name));
  if (unsafe !== undefined) {
    throw invalid(`'namespaces' entries must be plain directory names, got '${unsafe}'`);
  }
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
    personal: personalSettings(raw, CONFIG_FILE),
    decisionEdits: decisionEdits(raw.decision_edits),
    snapshotArtifacts: snapshotArtifacts(raw.snapshot_artifacts),
    ...optionalBaseBranch(raw.base_branch),
  };
}

// @decision(DL-087)
/**
 * Parses `dld.local.yaml`. Only the personal settings count; `warn` receives one message per
 * other key, except `x-` keys. An empty file sets nothing.
 */
export function parseLocalSettings(
  text: string,
  warn: (message: string) => void = () => {},
): PersonalSettings {
  const doc = parseDocument(text, { logLevel: "silent" });
  const problem = doc.errors[0] ?? doc.warnings[0];
  if (problem !== undefined) throw invalid(`not valid YAML: ${problem.message}`, LOCAL_FILE);
  const raw: unknown = doc.toJS() ?? {};
  if (!isRecord(raw)) throw invalid("expected a mapping of keys to values", LOCAL_FILE);
  for (const key of Object.keys(raw)) {
    if (key.startsWith("x-") || PERSONAL_KEYS.some((known) => known === key)) continue;
    warn(
      CONFIG_KEYS.some((known) => known === key)
        ? `${LOCAL_FILE}: '${key}' can only be set in ${CONFIG_FILE}`
        : unknownKeyMessage(key, LOCAL_FILE, PERSONAL_KEYS),
    );
  }
  return personalSettings(raw, LOCAL_FILE);
}

function personalSettings(raw: Record<string, unknown>, file: string): PersonalSettings {
  const settings: PersonalSettings = {};
  const implementReview = optionalBoolean(raw.implement_review, "implement_review", file);
  if (implementReview !== undefined) settings.implementReview = implementReview;
  const planReview = optionalBoolean(raw.plan_review, "plan_review", file);
  if (planReview !== undefined) settings.planReview = planReview;
  const reviewModel = optionalString(raw.review_model, "review_model", file);
  if (reviewModel !== undefined) settings.reviewModel = reviewModel;
  const implementModel = optionalString(raw.implement_review_model, "implement_review_model", file);
  if (implementModel !== undefined) settings.implementReviewModel = implementModel;
  const planModel = optionalString(raw.plan_review_model, "plan_review_model", file);
  if (planModel !== undefined) settings.planReviewModel = planModel;
  return settings;
}

function unknownKeyMessage(key: string, file: string, keys: readonly string[]): string {
  let closest: string | undefined;
  let best = 3;
  for (const known of keys) {
    const distance = editDistance(key, known);
    if (distance < best) [closest, best] = [known, distance];
  }
  const hint = closest === undefined ? "" : `; did you mean '${closest}'?`;
  return `${file}: unknown key '${key}'${hint}`;
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
  // Branch names only: no options, remote prefixes or revision syntax such as main~1 or @.
  if (
    branch.startsWith("-") ||
    branch === "@" ||
    /[\s~^:?*[\\]|\.\.|@\{|^\/|\/$|\.lock$|\.$|^origin\//.test(branch)
  ) {
    throw invalid(
      `'base_branch' must be a branch name such as main or develop, without origin/, got '${branch}'`,
    );
  }
  return { baseBranch: branch };
}

function invalid(message: string, file: string = CONFIG_FILE): DldError {
  return new DldError(`${file}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, key: string): string {
  const result = optionalString(value, key);
  if (result === undefined) throw invalid(`'${key}' is required`);
  return result;
}

function optionalString(value: unknown, key: string, file?: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid(`'${key}' must be a non-empty string`, file);
  }
  return value;
}

function optionalBoolean(value: unknown, key: string, file?: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw invalid(`'${key}' must be true or false`, file);
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
