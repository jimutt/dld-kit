export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

/**
 * The filesystem operations core needs. Grows only when a ported command needs more.
 * Failures throw `FsError`. Core writes through `writeFileAtomic`/`createFileExclusive`
 * (files.ts), not `writeFile` directly.
 */
// @decision(DL-015)
export interface FileSystem {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  /** True if anything exists at `path`, including a dangling symlink (not followed). */
  lexists(path: string): boolean;
  /** True only for a regular file; symlinks, devices and FIFOs are not followed or counted. */
  isRegularFile(path: string): boolean;
  readFile(path: string): string;
  /** The file's bytes, for rewrites that must leave everything but the replaced text unchanged. */
  readBytes(path: string): Uint8Array;
  readDir(path: string): DirEntry[];
  writeFile(path: string, content: string | Uint8Array): void;
  /** Permission bits of a file, not following symlinks. */
  fileMode(path: string): number;
  chmod(path: string, mode: number): void;
  /** Creates the directory and any missing parents. */
  mkdir(path: string): void;
  rename(from: string, to: string): void;
  /** Hard-links `existing` to `newPath`; fails with EEXIST if `newPath` exists. */
  link(existing: string, newPath: string): void;
  /** Removes a file; does nothing if it does not exist. */
  remove(path: string): void;
}

// @decision(DL-008)
export interface Context {
  cwd: string;
  fs: FileSystem;
  /** Runs git in `cwd` and returns stdout. Throws `GitCommandError` on a non-zero exit. */
  git(args: readonly string[]): string;
  // @decision(DL-026)
  /**
   * Runs gh in `cwd` and returns stdout. Throws `ToolNotFoundError` if gh is not installed and
   * `GhCommandError` on a non-zero exit or timeout.
   */
  gh(args: readonly string[]): string;
  env: Readonly<Record<string, string | undefined>>;
  // @decision(DL-016)
  /** All of standard input as UTF-8. Call only when a command was asked to read it. */
  readStdin(): string;
  now(): Date;
}
