import { join } from "node:path";
import { type Config, loadConfig } from "./config.ts";
import type { Context } from "./context.ts";
import { DldError, GitCommandError } from "./errors.ts";

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

export function loadProject(ctx: Context): Project {
  const root = findProjectRoot(ctx);
  const config = loadConfig(ctx, root);
  return { config, paths: resolvePaths(root, config) };
}
