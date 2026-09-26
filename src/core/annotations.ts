import { join, relative, sep } from "node:path";
import type { Context } from "./context.ts";
import type { Project } from "./project.ts";

// @decision(DL-019)
/** Directories never scanned, wherever they appear in a path. */
export const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  ".git",
  ".claude",
  ".tessl",
  "node_modules",
  "vendor",
  ".venv",
  "__pycache__",
  "target",
  "dist",
  "build",
  "out",
  ".next",
  ".gradle",
  "coverage",
]);

const EXCLUDED_FILE = /(\.lock|\.min\.js|\.min\.css|\.map)$/;
const BINARY_SNIFF_BYTES = 8192;

export interface Annotation {
  /** Path relative to the project root, with `/` separators. */
  file: string;
  line: number;
  id: string;
}

export interface ScanOptions {
  root: string;
  decisionsDir: string;
  prefix: string;
  /** git glob patterns to leave out (DL-023). */
  exclude?: readonly string[];
}

export function scanOptionsFor({ config, paths }: Project): ScanOptions {
  return {
    root: paths.root,
    decisionsDir: paths.decisionsDir,
    prefix: config.annotationPrefix,
    exclude: config.annotationExclude,
  };
}

// @decision(DL-019)
/** Files to scan: git's tracked and non-ignored untracked files, minus the exclusions. */
export function listScannableFiles(ctx: Context, options: ScanOptions): string[] {
  const output = ctx.git([
    "-C",
    options.root,
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    // @decision(DL-023)
    "--",
    ...(options.exclude ?? []).map((pattern) => `:(exclude,glob)${pattern}`),
  ]);
  const decisionsRel = relative(options.root, options.decisionsDir).split(sep).join("/");
  const files = new Set<string>();
  for (const file of output.split("\0")) {
    if (file === "" || EXCLUDED_FILE.test(file)) continue;
    if (file === decisionsRel || file.startsWith(`${decisionsRel}/`)) continue;
    const dirs = file.split("/").slice(0, -1);
    if (dirs.some((dir) => EXCLUDED_DIRS.has(dir))) continue;
    files.add(file);
  }
  return [...files].sort();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// @decision(DL-019) @decision(DL-022)
/** Every `<prefix>(DL-NNN)` annotation in the project's scannable files, in file and line order. */
export function scanAnnotations(ctx: Context, options: ScanOptions): Annotation[] {
  const pattern = new RegExp(`${escapeRegExp(options.prefix)}\\((DL-\\d+)\\)`, "g");
  const found: Annotation[] = [];
  for (const file of listScannableFiles(ctx, options)) {
    const path = join(options.root, file);
    // git also lists deleted-but-tracked files, submodule directories and symlinks.
    if (!ctx.fs.isRegularFile(path)) continue;
    const text = ctx.fs.readFile(path);
    if (text.slice(0, BINARY_SNIFF_BYTES).includes("\0")) continue;
    text.split("\n").forEach((content, index) => {
      for (const match of content.matchAll(pattern)) {
        if (match[1] !== undefined) found.push({ file, line: index + 1, id: match[1] });
      }
    });
  }
  return found;
}

// @decision(DL-019)
/** The IDs, in the given order, that have no annotation anywhere in the project. */
export function missingAnnotations(
  ctx: Context,
  options: ScanOptions,
  ids: readonly string[],
): string[] {
  const annotated = new Set(scanAnnotations(ctx, options).map((annotation) => annotation.id));
  return ids.filter((id) => !annotated.has(id));
}

/** `<file>:<line>:<DL-NNN>`, as find-annotations.sh printed it. */
export function formatAnnotation({ file, line, id }: Annotation): string {
  return `${file}:${line}:${id}`;
}
