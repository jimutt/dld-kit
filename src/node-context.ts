// @decision(DL-008) @decision(DL-007)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import type { Context, FileSystem } from "./core/context.ts";
import { DldError, GitCommandError } from "./core/errors.ts";

export const nodeFileSystem: FileSystem = {
  exists: (path) => existsSync(path),
  isDirectory: (path) =>
    fsCall(path, () => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false),
  readFile: (path) => fsCall(path, () => readFileSync(path, "utf8")),
  readDir: (path) =>
    fsCall(path, () =>
      readdirSync(path, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      })),
    ),
};

/** Filesystem failures (EACCES, EISDIR, ...) are environment problems, reported as DldError. */
function fsCall<T>(path: string, operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof Error && "code" in error && typeof error.code === "string") {
      throw new DldError(`cannot read ${path}: ${error.code}`);
    }
    throw error;
  }
}

export function nodeGit(cwd: string, env: Context["env"]): Context["git"] {
  return (args) => {
    try {
      return execFileSync("git", args, {
        cwd,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      if (hasCode(error, "ENOENT")) throw new DldError("git is not installed or not on PATH");
      if (hasStatus(error)) throw new GitCommandError(args, String(error.stderr ?? "").trim());
      throw error;
    }
  };
}

export function createNodeContext(
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): Context {
  return { cwd, fs: nodeFileSystem, git: nodeGit(cwd, env), env };
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function hasStatus(error: unknown): error is Error & { status: number; stderr?: unknown } {
  return error instanceof Error && "status" in error && typeof error.status === "number";
}
