import { join } from "node:path";
import { version } from "../../package.json";
import { CONFIG_FILE, ID_FORMATS, type IdFormat, type Mode } from "./config.ts";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";
import { createFileExclusive } from "./files.ts";
import type { Project } from "./project.ts";
import { satisfiesMinimum, TIMESTAMP_IDS_SINCE } from "./version.ts";

export function parseMode(value: string): Mode {
  if (value !== "flat" && value !== "namespaced") {
    throw new DldError(`mode must be 'flat' or 'namespaced', got '${value}'.`);
  }
  return value;
}

// @decision(DL-100)
export function parseIdFormat(value: string): IdFormat {
  const found = ID_FORMATS.find((format) => format === value);
  if (found === undefined) {
    throw new DldError(`ID format must be one of ${ID_FORMATS.join(", ")}, got '${value}'.`);
  }
  return found;
}

// @decision(DL-100)
/**
 * dld.config.yaml as create-config.sh writes it. With `idFormat` it also names the form; for
 * timestamp IDs it adds the oldest dld that reads them, so an older one refuses the project.
 * That line is left out when `running`, this dld, is itself older: a build made before the
 * release that carries the version would otherwise refuse the project it just set up.
 */
export function renderConfig(
  mode: Mode,
  namespaces: readonly string[],
  idFormat?: IdFormat,
  running: string = version,
): string {
  const lines = ["decisions_dir: decisions", `mode: ${mode}`];
  if (mode === "namespaced") lines.push("namespaces:", ...namespaces.map((ns) => `  - ${ns}`));
  lines.push("annotation_prefix: '@decision'");
  if (idFormat !== undefined) lines.push(`id_format: ${idFormat}`);
  if (idFormat === "timestamp" && satisfiesMinimum(running, TIMESTAMP_IDS_SINCE)) {
    lines.push(`min_dld_version: ${TIMESTAMP_IDS_SINCE}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Creates dld.config.yaml at `root` and returns its path. */
export function createConfig(
  ctx: Context,
  root: string,
  mode: Mode,
  namespaces: readonly string[],
  idFormat?: IdFormat,
): string {
  if (mode === "namespaced" && namespaces.length === 0) {
    throw new DldError("namespaced mode requires at least one namespace.");
  }
  const path = join(root, CONFIG_FILE);
  createFileExclusive(
    ctx,
    path,
    renderConfig(mode, namespaces, idFormat),
    `${CONFIG_FILE} already exists.`,
  );
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
    if (!ctx.fs.exists(keep)) createFileExclusive(ctx, keep, "", `${keep} already exists.`);
  }
}
