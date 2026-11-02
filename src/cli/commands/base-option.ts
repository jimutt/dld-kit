import type { Context } from "../../core/context.ts";
import type { Project } from "../../core/project.ts";
import { resolveBase } from "../../core/reindex.ts";
import { UsageError } from "../command.ts";

// @decision(DL-027) @decision(DL-071)
/**
 * The `--base` value, or the base `resolve-base` picks when `project` is given. A value that
 * looks like an option is a usage error.
 */
export function baseOption(
  value: string | undefined,
  defaults?: { ctx: Context; project: Project },
): string {
  if (value === undefined && defaults !== undefined) {
    return resolveBase(defaults.ctx, defaults.project.config.baseBranch);
  }
  if (value === undefined || value === "") throw new UsageError("--base is required.");
  if (value.startsWith("-")) throw new UsageError(`--base must be a git ref, got '${value}'`);
  return value;
}

/** How the commands that resolve a default base describe it in their usage. */
export const DEFAULT_BASE_HELP = "default: the base resolve-base picks";

/** The notice printed when the open-PR scan was skipped (DL-026). */
export function skippedNotice(reason: string): string {
  return `[dld-reindex] open PRs not scanned: ${reason}\n`;
}
