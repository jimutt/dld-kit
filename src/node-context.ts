// @decision(DL-008) @decision(DL-007)
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type { Context, FileSystem } from "./core/context.ts";
import {
  DldError,
  FsError,
  GhCommandError,
  GitCommandError,
  ToolNotFoundError,
} from "./core/errors.ts";

export const nodeFileSystem: FileSystem = {
  exists: (path) => existsSync(path),
  isDirectory: (path) =>
    fsCall("read", path, () => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false),
  lexists: (path) =>
    fsCall("read", path, () => lstatSync(path, { throwIfNoEntry: false }) !== undefined),
  isRegularFile: (path) =>
    fsCall("read", path, () => lstatSync(path, { throwIfNoEntry: false })?.isFile() ?? false),
  readFile: (path) => fsCall("read", path, () => readFileSync(path, "utf8")),
  readBytes: (path) => fsCall("read", path, () => readFileSync(path)),
  readDir: (path) =>
    fsCall("read", path, () =>
      readdirSync(path, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      })),
    ),
  writeFile: (path, content) => fsCall("write", path, () => writeFileSync(path, content)),
  fileMode: (path) => fsCall("read", path, () => lstatSync(path).mode & 0o7777),
  chmod: (path, mode) => fsCall("change mode of", path, () => chmodSync(path, mode)),
  mkdir: (path) =>
    fsCall("create directory", path, () => void mkdirSync(path, { recursive: true })),
  rename: (from, to) => fsCall("rename", from, () => renameSync(from, to)),
  link: (existing, newPath) => fsCall("create", newPath, () => linkSync(existing, newPath)),
  remove: (path) => fsCall("remove", path, () => rmSync(path, { force: true })),
  removeDir: (path) => fsCall("remove directory", path, () => rmdirSync(path)),
};

/** Filesystem failures (EACCES, EISDIR, ...) are environment problems, reported as FsError. */
function fsCall<T>(operation: string, path: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof Error && "code" in error && typeof error.code === "string") {
      throw new FsError(operation, path, error.code);
    }
    throw error;
  }
}

/** Large repositories list tens of MB of paths; execFileSync's default is 1 MB. */
const GIT_MAX_BUFFER = 1024 * 1024 * 1024;

export function nodeGit(cwd: string, env: Context["env"]): Context["git"] {
  return (args) => {
    try {
      return execFileSync("git", args, {
        cwd,
        env,
        encoding: "utf8",
        maxBuffer: GIT_MAX_BUFFER,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      if (hasCode(error, "ENOENT")) throw new DldError("git is not installed or not on PATH");
      if (hasCode(error, "ENOBUFS")) {
        throw new DldError(`git ${args.join(" ")} produced more output than dld can buffer`);
      }
      if (hasStatus(error)) {
        throw new GitCommandError(args, String(error.stderr ?? "").trim(), error.status);
      }
      throw error;
    }
  };
}

const GH_TIMEOUT_MS = 60_000;

// @decision(DL-026)
export function nodeGh(
  cwd: string,
  env: Context["env"],
  timeoutMs: number = GH_TIMEOUT_MS,
): Context["gh"] {
  return (args) => {
    try {
      return execFileSync("gh", args, {
        cwd,
        env: { ...env, GH_PROMPT_DISABLED: "1" },
        encoding: "utf8",
        maxBuffer: GIT_MAX_BUFFER,
        timeout: timeoutMs,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      if (hasCode(error, "ENOENT")) throw new ToolNotFoundError("gh");
      if (hasCode(error, "ETIMEDOUT")) {
        throw new GhCommandError(args, `timed out after ${timeoutMs / 1000} seconds`);
      }
      if (hasStatus(error)) throw new GhCommandError(args, String(error.stderr ?? "").trim());
      throw error;
    }
  };
}

export function createNodeContext(
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): Context {
  return {
    cwd,
    fs: nodeFileSystem,
    git: nodeGit(cwd, env),
    gh: nodeGh(cwd, env),
    env,
    readStdin: () => fsCall("read", "standard input", () => readFileSync(0, "utf8")),
    now: () => new Date(),
  };
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function hasStatus(error: unknown): error is Error & { status: number; stderr?: unknown } {
  return error instanceof Error && "status" in error && typeof error.status === "number";
}
