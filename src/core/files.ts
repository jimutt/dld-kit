import { basename, dirname, join } from "node:path";
import type { Context } from "./context.ts";
import { DldError, FsError } from "./errors.ts";

export const TEMP_PREFIX = ".dld-tmp-";

function tempPathFor(path: string): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return join(dirname(path), `${TEMP_PREFIX}${basename(path)}.${suffix}`);
}

// @decision(DL-015)
/** Replaces `path` with `content` so readers see either the old or the new file, never a partial one. */
export function writeFileAtomic(ctx: Context, path: string, content: string): void {
  const temp = tempPathFor(path);
  try {
    ctx.fs.writeFile(temp, content);
    ctx.fs.rename(temp, path);
  } catch (error) {
    ctx.fs.remove(temp);
    throw error;
  }
}

// @decision(DL-015)
/** Creates `path` with `content`, failing with `existsMessage` if it already exists. */
export function createFileExclusive(
  ctx: Context,
  path: string,
  content: string,
  existsMessage: string,
): void {
  const temp = tempPathFor(path);
  try {
    ctx.fs.writeFile(temp, content);
    ctx.fs.link(temp, path);
  } catch (error) {
    if (error instanceof FsError && error.code === "EEXIST") throw new DldError(existsMessage);
    throw error;
  } finally {
    ctx.fs.remove(temp);
  }
}
