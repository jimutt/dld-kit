import { join } from "node:path";
import { LOCAL_FILE } from "../core/config.ts";
import type { Context } from "../core/context.ts";
import { GitCommandError } from "../core/errors.ts";
import { writeFileAtomic } from "../core/files.ts";
import { gitAt } from "../core/git.ts";

export const GITIGNORE = ".gitignore";
export const LOCAL_IGNORE_COMMENT = "# dld-kit: one developer's DLD settings for this checkout";

export interface IgnorePlan {
  /** The new `.gitignore` content, or undefined when nothing needs writing. */
  content?: string;
  /** Whether the plan creates the file. */
  creates?: boolean;
  warnings: string[];
}

// @decision(DL-087)
/**
 * Plans the root `.gitignore` line for `dld.local.yaml`. Nothing is planned when an ignore rule,
 * wherever it is, already matches the file.
 */
export function planLocalSettingsIgnore(ctx: Context, root: string): IgnorePlan {
  const wanted = `/${LOCAL_FILE}`;
  try {
    gitAt(ctx, root)("check-ignore", "-q", "--no-index", LOCAL_FILE);
    return { warnings: [] };
  } catch (error) {
    // check-ignore exits 1 when no rule matches; anything else means it couldn't tell.
    if (!(error instanceof GitCommandError) || error.status !== 1) {
      return {
        warnings: [
          `could not check whether git ignores ${LOCAL_FILE}. Add this line to ${GITIGNORE} so personal settings are not committed: ${wanted}`,
        ],
      };
    }
  }
  const path = join(root, GITIGNORE);
  if (ctx.fs.lexists(path) && !ctx.fs.isRegularFile(path)) {
    return {
      warnings: [
        `${GITIGNORE} is not a regular file, so dld-kit does not edit it. Add this line to it yourself: ${wanted}`,
      ],
    };
  }
  const text = ctx.fs.lexists(path) ? ctx.fs.readFile(path) : "";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const separator = text === "" ? "" : text.endsWith("\n") ? eol : eol + eol;
  return {
    content: `${text}${separator}${LOCAL_IGNORE_COMMENT}${eol}${wanted}${eol}`,
    creates: !ctx.fs.lexists(path),
    warnings: [],
  };
}

/** Writes a planned `.gitignore`; returns whether it wrote one. */
export function applyLocalSettingsIgnore(ctx: Context, root: string, plan: IgnorePlan): boolean {
  if (plan.content === undefined) return false;
  writeFileAtomic(ctx, join(root, GITIGNORE), plan.content);
  return true;
}
