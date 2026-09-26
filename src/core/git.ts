import { relative, sep } from "node:path";
import type { Context } from "./context.ts";
import { GitCommandError } from "./errors.ts";
import type { ProjectPaths } from "./project.ts";

/** Runs git at the project root. */
export function gitAt(ctx: Context, root: string): (...args: string[]) => string {
  return (...args) => ctx.git(["-C", root, ...args]);
}

/** Runs git, treating a failure as empty output (the scripts used `|| true`). */
export function gitOrEmpty(git: (...args: string[]) => string, ...args: string[]): string {
  try {
    return git(...args);
  } catch (error) {
    if (error instanceof GitCommandError) return "";
    throw error;
  }
}

/** Splits `-z` output into paths. */
export function nulSeparated(output: string): string[] {
  return output.split("\0").filter((path) => path !== "");
}

/** The records directory as a root-relative, `/`-separated git pathspec. */
export function recordsPathspec(paths: ProjectPaths): string {
  return relative(paths.root, paths.recordsDir).split(sep).join("/");
}

const COMMIT_HASH = /^[0-9a-f]{4,64}$/i;

/**
 * A commit hash read from the state file, if it is a hex hash that names a commit in this
 * repository. Anything else (`unknown`, option-like text, a tree or blob) counts as absent.
 */
export function resolveStateCommit(
  git: (...args: string[]) => string,
  value: string | undefined,
): string | undefined {
  if (value === undefined || !COMMIT_HASH.test(value)) return undefined;
  return gitOrEmpty(git, "rev-parse", "--verify", "--quiet", `${value}^{commit}`) === ""
    ? undefined
    : value;
}
