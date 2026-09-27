import { join } from "node:path";
import { parseDocument } from "yaml";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";

export const CONFIG_FILE = "dld.config.yaml";

export type Mode = "flat" | "namespaced";

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
  snapshotArtifacts: SnapshotArtifact[];
}

export function loadConfig(ctx: Context, root: string): Config {
  const path = join(root, CONFIG_FILE);
  if (!ctx.fs.exists(path)) {
    throw new DldError(`${CONFIG_FILE} not found. Run /dld-init first.`);
  }
  return parseConfig(ctx.fs.readFile(path));
}

// @decision(DL-009)
export function parseConfig(text: string): Config {
  // logLevel "silent": problems are reported through doc.errors/doc.warnings, never printed.
  const doc = parseDocument(text, { logLevel: "silent" });
  const problem = doc.errors[0] ?? doc.warnings[0];
  if (problem !== undefined) throw invalid(`not valid YAML: ${problem.message}`);
  const raw: unknown = doc.toJS();
  if (!isRecord(raw)) throw invalid("expected a mapping of keys to values");

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
    snapshotArtifacts: snapshotArtifacts(raw.snapshot_artifacts),
  };
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
