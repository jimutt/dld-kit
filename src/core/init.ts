import { join } from "node:path";
import { CONFIG_FILE, type Mode } from "./config.ts";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";
import { createFileExclusive } from "./files.ts";
import type { Project } from "./project.ts";

export function parseMode(value: string): Mode {
  if (value !== "flat" && value !== "namespaced") {
    throw new DldError(`mode must be 'flat' or 'namespaced', got '${value}'.`);
  }
  return value;
}

/** dld.config.yaml as create-config.sh writes it. */
export function renderConfig(mode: Mode, namespaces: readonly string[]): string {
  const lines = ["decisions_dir: decisions", `mode: ${mode}`];
  if (mode === "namespaced") lines.push("namespaces:", ...namespaces.map((ns) => `  - ${ns}`));
  lines.push("annotation_prefix: '@decision'");
  return `${lines.join("\n")}\n`;
}

/** Creates dld.config.yaml at `root` and returns its path. */
export function createConfig(
  ctx: Context,
  root: string,
  mode: Mode,
  namespaces: readonly string[],
): string {
  if (mode === "namespaced" && namespaces.length === 0) {
    throw new DldError("namespaced mode requires at least one namespace.");
  }
  const path = join(root, CONFIG_FILE);
  createFileExclusive(ctx, path, renderConfig(mode, namespaces), `${CONFIG_FILE} already exists.`);
  return path;
}

/** Creates the decisions and records directories, plus one per namespace with a .gitkeep. */
export function createDirectories(ctx: Context, { config, paths }: Project): void {
  ctx.fs.mkdir(paths.decisionsDir);
  ctx.fs.mkdir(paths.recordsDir);
  if (config.mode !== "namespaced") return;
  for (const namespace of config.namespaces) {
    const dir = join(paths.recordsDir, namespace);
    ctx.fs.mkdir(dir);
    const keep = join(dir, ".gitkeep");
    if (!ctx.fs.exists(keep)) ctx.fs.writeFile(keep, "");
  }
}
