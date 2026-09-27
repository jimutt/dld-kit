import { posix } from "node:path";
import { DldError } from "./errors.ts";
import { recordsPathspec } from "./git.ts";
import type { ProjectPaths } from "./project.ts";
import { DECISION_ID } from "./records.ts";
import type { Rename } from "./reindex.ts";

// @decision(DL-028)
/**
 * The problem with one rename, or undefined if it is valid: both IDs well-formed and different,
 * and the path a root-relative `/`-separated path under the records directory named
 * `<old ID>.md`.
 */
export function renameProblem(paths: ProjectPaths, rename: Rename): string | undefined {
  const { path, oldId, newId } = rename;
  if (!DECISION_ID.test(oldId) || !DECISION_ID.test(newId)) return "IDs must match DL-[0-9]+.";
  if (oldId === newId) return "old and new IDs are the same.";
  const segments = path.split("/");
  if (path.startsWith("/") || segments.some((s) => s === "" || s === "." || s === "..")) {
    return `path '${path}' must be relative to the project root, without '.' or '..' segments.`;
  }
  const records = recordsPathspec(paths);
  if (!path.startsWith(`${records}/`)) {
    return `path '${path}' is not under ${records}/.`;
  }
  if (posix.basename(path) !== `${oldId}.md`) {
    return `path '${path}' is not named ${oldId}.md.`;
  }
  return undefined;
}

// @decision(DL-028)
/**
 * Parses and validates a rename plan (`<path>\t<DL-OLD>\t<DL-NEW>` per line). Blank lines are
 * ignored. Every line is checked before anything is returned; the first problem throws.
 */
export function parseRenamePlan(paths: ProjectPaths, text: string): Rename[] {
  const renames: Rename[] = [];
  const lineNumbers: number[] = [];
  const seen = { path: new Set<string>(), old: new Set<string>(), new: new Set<string>() };
  text.split("\n").forEach((raw, index) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.trim() === "") return;
    const fail = (message: string) => new DldError(`rename plan line ${index + 1}: ${message}`);
    const fields = line.split("\t");
    const [path, oldId, newId] = fields;
    if (fields.length !== 3 || path === undefined || oldId === undefined || newId === undefined) {
      throw fail("expected <path>\\t<DL-OLD>\\t<DL-NEW>.");
    }
    const rename = { path, oldId, newId };
    const problem = renameProblem(paths, rename);
    if (problem !== undefined) throw fail(problem);
    if (seen.path.has(path)) throw fail(`path '${path}' appears more than once.`);
    if (seen.old.has(oldId)) throw fail(`${oldId} is renamed more than once.`);
    if (seen.new.has(newId)) throw fail(`${newId} is the target of more than one rename.`);
    seen.path.add(path);
    seen.old.add(oldId);
    seen.new.add(newId);
    renames.push(rename);
    lineNumbers.push(index + 1);
  });
  renames.forEach(({ newId }, index) => {
    if (seen.old.has(newId)) {
      throw new DldError(
        `rename plan line ${lineNumbers[index]}: ${newId} is both renamed and a rename target.`,
      );
    }
  });
  return renames;
}
