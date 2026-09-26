export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

/** The filesystem operations core needs. Grows only when a ported command needs more. */
export interface FileSystem {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  readFile(path: string): string;
  readDir(path: string): DirEntry[];
}

// @decision(DL-008)
export interface Context {
  cwd: string;
  fs: FileSystem;
  /** Runs git in `cwd` and returns stdout. Throws `GitCommandError` on a non-zero exit. */
  git(args: readonly string[]): string;
  env: Readonly<Record<string, string | undefined>>;
}
