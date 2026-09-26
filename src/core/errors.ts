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

/** A git command ran and exited non-zero. */
export class GitCommandError extends DldError {
  readonly stderr: string;

  constructor(args: readonly string[], stderr: string) {
    super(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
    this.name = "GitCommandError";
    this.stderr = stderr;
  }
}
