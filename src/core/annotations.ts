import { join, relative, sep } from "node:path";
import type { Context } from "./context.ts";
import { FsError } from "./errors.ts";
import type { Project } from "./project.ts";

// @decision(DL-019) @decision(DL-060)
/** Directories never scanned, wherever they appear in a path. */
export const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  ".git",
  // Agent configuration directories, which hold installed skills.
  ".claude",
  ".agents",
  ".agent",
  ".codex",
  ".cursor",
  ".opencode",
  ".pi",
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
/** A file with a NUL byte this early is treated as binary. */
export const BINARY_SNIFF_BYTES = 8192;
// @decision(DL-069)
/** Files larger than this are skipped unread: annotations live in source files. */
export const MAX_SCAN_BYTES = 16 * 1024 * 1024;

export interface Annotation {
  /** Path relative to the project root, with `/` separators. */
  file: string;
  line: number;
  id: string;
}

/** A listed file the scanner could not read, so its annotations were not counted. */
export interface SkippedFile {
  /** Path relative to the project root, with `/` separators. */
  file: string;
  reason: string;
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

// @decision(DL-069)
/**
 * The text of a scannable file, or undefined when it is not a regular file or is binary. A file
 * over MAX_SCAN_BYTES, or one that cannot be read, is passed to `onSkip` instead of failing the
 * scan.
 */
function readScannable(
  ctx: Context,
  root: string,
  file: string,
  onSkip: (skipped: SkippedFile) => void,
): string | undefined {
  const path = join(root, file);
  let text: string;
  try {
    // git also lists deleted-but-tracked files, submodule directories and symlinks.
    if (!ctx.fs.isRegularFile(path)) return undefined;
    if (ctx.fs.fileSize(path) > MAX_SCAN_BYTES) {
      onSkip({ file, reason: `larger than ${MAX_SCAN_BYTES / 1024 / 1024} MB` });
      return undefined;
    }
    text = ctx.fs.readFile(path);
  } catch (error) {
    if (!(error instanceof FsError)) throw error;
    onSkip({ file, reason: error.message });
    return undefined;
  }
  return text.slice(0, BINARY_SNIFF_BYTES).includes("\0") ? undefined : text;
}

// @decision(DL-019) @decision(DL-022) @decision(DL-069)
/**
 * Every `<prefix>(DL-NNN)` annotation in the project's scannable files, in file and line order.
 * Files that are too large or unreadable are reported to `onSkip` and left out.
 */
export function scanAnnotations(
  ctx: Context,
  options: ScanOptions,
  onSkip: (skipped: SkippedFile) => void = () => {},
): Annotation[] {
  const pattern = new RegExp(`${escapeRegExp(options.prefix)}\\((DL-\\d+)\\)`, "g");
  const found: Annotation[] = [];
  for (const file of listScannableFiles(ctx, options)) {
    const text = readScannable(ctx, options.root, file, onSkip);
    if (text === undefined) continue;
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
  onSkip?: (skipped: SkippedFile) => void,
): string[] {
  const annotated = new Set(
    scanAnnotations(ctx, options, onSkip).map((annotation) => annotation.id),
  );
  return ids.filter((id) => !annotated.has(id));
}

// @decision(DL-069)
/** The stderr line for a file the scan left out. */
export function formatSkipped({ file, reason }: SkippedFile): string {
  return `Warning: skipped ${file} (${reason}); annotations in it are not counted`;
}

/** `<file>:<line>:<DL-NNN>`, as find-annotations.sh printed it. */
export function formatAnnotation({ file, line, id }: Annotation): string {
  return `${file}:${line}:${id}`;
}
