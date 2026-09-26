import { join, relative } from "node:path";
import { Document, isMap, parseDocument } from "yaml";
import type { Context } from "./context.ts";
import { DldError, GitCommandError } from "./errors.ts";
import { writeFileAtomic } from "./files.ts";
import type { ProjectPaths } from "./project.ts";

export const STATE_FILE = ".dld-state.yaml";

export type StateSection = "audit" | "snapshot";

/** A section's values; every scalar is a string (failsafe schema). */
export type SectionValue = { [key: string]: string | SectionValue };

export function statePath(paths: ProjectPaths): string {
  return join(paths.decisionsDir, STATE_FILE);
}

// @decision(DL-021)
function loadStateDocument(ctx: Context, paths: ProjectPaths): Document {
  const path = statePath(paths);
  if (!ctx.fs.exists(path)) return new Document(undefined, { schema: "failsafe" });
  const source = relative(paths.root, path);
  const doc = parseDocument(ctx.fs.readFile(path), { schema: "failsafe", logLevel: "silent" });
  const problem = doc.errors[0] ?? doc.warnings[0];
  if (problem !== undefined) throw new DldError(`${source}: not valid YAML: ${problem.message}`);
  if (doc.contents !== null && !isMap(doc.contents)) {
    throw new DldError(`${source}: expected a mapping of sections`);
  }
  return doc;
}

// @decision(DL-021)
/** A section of the state file as strings, or undefined if the file or section is absent. */
export function readStateSection(
  ctx: Context,
  paths: ProjectPaths,
  section: StateSection,
): Record<string, unknown> | undefined {
  const value: unknown = loadStateDocument(ctx, paths).toJS()?.[section];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value }
    : undefined;
}

// @decision(DL-021) @decision(DL-015)
/** Replaces one top-level section, keeping every other section and its comments. */
export function writeStateSection(
  ctx: Context,
  paths: ProjectPaths,
  section: StateSection,
  value: SectionValue,
): void {
  const doc = loadStateDocument(ctx, paths);
  doc.set(section, value);
  writeFileAtomic(ctx, statePath(paths), String(doc));
}

/** A string field of a state section, or undefined when absent or empty. */
export function stateString(
  section: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = section?.[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** `git rev-parse --short HEAD`, or `unknown` when HEAD does not resolve (e.g. no commits). */
export function shortHead(ctx: Context, root: string): string {
  try {
    return ctx.git(["-C", root, "rev-parse", "--short", "HEAD"]).trim();
  } catch (error) {
    if (error instanceof GitCommandError) return "unknown";
    throw error;
  }
}
