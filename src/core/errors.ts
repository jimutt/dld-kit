export const EXIT_ERROR = 1;

// @decision(DL-012)
export class DldError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = EXIT_ERROR) {
    super(message);
    this.name = "DldError";
    this.exitCode = exitCode;
  }
}

/** A filesystem operation failed; `code` is the errno code, e.g. EEXIST or EACCES. */
export class FsError extends DldError {
  readonly code: string;

  constructor(operation: string, path: string, code: string) {
    super(`cannot ${operation} ${path}: ${code}`);
    this.name = "FsError";
    this.code = code;
  }
}

/** A git command ran and exited non-zero. */
export class GitCommandError extends DldError {
  readonly stderr: string;

  constructor(args: readonly string[], stderr: string) {
    super(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
    this.name = "GitCommandError";
    this.stderr = stderr;
  }
}

/** A required external program (e.g. gh) is not installed or not on PATH. */
export class ToolNotFoundError extends DldError {
  readonly tool: string;

  constructor(tool: string) {
    super(`${tool} is not installed or not on PATH`);
    this.name = "ToolNotFoundError";
    this.tool = tool;
  }
}

/** A gh command ran and exited non-zero, or timed out. */
export class GhCommandError extends DldError {
  readonly stderr: string;

  constructor(args: readonly string[], stderr: string) {
    super(`gh ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
    this.name = "GhCommandError";
    this.stderr = stderr;
  }
}
