import { type ParseArgsConfig, parseArgs } from "node:util";
import type { Context } from "../core/context.ts";
import { DldError } from "../core/errors.ts";

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
}

// @decision(DL-011)
export interface Command {
  /** The script name this command replaces, without `.sh`. */
  name: string;
  summary: string;
  usage: string;
  run(args: readonly string[], io: Io, ctx: Context): number;
}

/** Bad arguments. The CLI prints the message and the command's usage, and exits 2. */
export class UsageError extends DldError {
  constructor(message: string) {
    super(message, EXIT_USAGE);
    this.name = "UsageError";
  }
}

// @decision(DL-011)
/** `parseArgs` (strict by default) with its errors turned into usage errors. */
export function parseCommandArgs<T extends ParseArgsConfig>(
  config: T,
): ReturnType<typeof parseArgs<T>> {
  try {
    return parseArgs(config);
  } catch (error) {
    if (error instanceof TypeError && "code" in error) throw new UsageError(error.message);
    throw error;
  }
}
