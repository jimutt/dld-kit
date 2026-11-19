import { join } from "node:path";
import { version } from "../../package.json";
import { type Config, loadConfig } from "./config.ts";
import type { Context } from "./context.ts";
import { DldError, GitCommandError } from "./errors.ts";
import { satisfiesMinimum, tooOldMessage } from "./version.ts";

// @decision(DL-010)
export function findProjectRoot(ctx: Context): string {
  try {
    return ctx.git(["rev-parse", "--show-toplevel"]).trim();
  } catch (error) {
    if (error instanceof GitCommandError) throw new DldError("not a git repository");
    throw error;
  }
}

export interface ProjectPaths {
  root: string;
  decisionsDir: string;
  recordsDir: string;
}

export function resolvePaths(root: string, config: Config): ProjectPaths {
  const decisionsDir = join(root, config.decisionsDir);
  return { root, decisionsDir, recordsDir: join(decisionsDir, "records") };
}

export interface Project {
  config: Config;
  paths: ProjectPaths;
}

// @decision(DL-098)
/**
 * The project's config and paths. Fails when the config's `min_dld_version` is above
 * `running`, this dld's version, before anything else is read or written. Commands that
 * install or update dld-kit pass `anyVersion`.
 */
export function loadProject(
  ctx: Context,
  { anyVersion = false, running = version }: { anyVersion?: boolean; running?: string } = {},
): Project {
  const root = findProjectRoot(ctx);
  const config = loadConfig(ctx, root);
  const minimum = config.minDldVersion;
  if (!anyVersion && minimum !== undefined && !satisfiesMinimum(running, minimum)) {
    throw new DldError(tooOldMessage(running, minimum));
  }
  return { config, paths: resolvePaths(root, config) };
}
