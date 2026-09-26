import { type ParseArgsConfig, parseArgs } from "node:util";
import type { Context } from "../core/context.ts";
import { DldError } from "../core/errors.ts";

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;

export interface Io {
  stdout(text: string): void;
  stderr(text: string): void;
  // @decision(DL-042)
  /** The running CLI file; `init` and `update` install it and read the templates beside it. */
  cliPath?: string;
  // @decision(DL-041)
  /** Asks a question and resolves with the reply; set only on an interactive terminal. */
  prompt?(question: string): Promise<string>;
}

// @decision(DL-011)
export interface Command {
  /** Ported commands keep the name of the script they replace, without `.sh`. */
  name: string;
  summary: string;
  usage: string;
  run(args: readonly string[], io: Io, ctx: Context): number | Promise<number>;
}

/** Bad arguments. The CLI prints the message and the command's usage, and exits 2. */
export class UsageError extends DldError {
  constructor(message: string) {
    super(message, EXIT_USAGE);
    this.name = "UsageError";
  }
}

/** Thrown by `parseCommandArgs` when -h/--help was given; the CLI prints the command's usage. */
export class HelpRequested extends Error {
  constructor() {
    super("help requested");
    this.name = "HelpRequested";
  }
}

// @decision(DL-011) @decision(DL-017)
/**
 * `parseArgs` (strict by default) for a command. Throws `HelpRequested` for -h/--help and
 * turns parse errors into usage errors.
 */
export function parseCommandArgs<T extends ParseArgsConfig>(
  config: T,
): ReturnType<typeof parseArgs<T>> {
  if (requestsHelp(config)) throw new HelpRequested();
  try {
    return parseArgs(config);
  } catch (error) {
    if (error instanceof TypeError && "code" in error) throw new UsageError(error.message);
    throw error;
  }
}

/** True if -h/--help appears as an option, rather than as an option's value or after `--`. */
function requestsHelp(config: ParseArgsConfig): boolean {
  const { tokens } = parseArgs({
    ...config,
    options: { ...config.options, help: { type: "boolean", short: "h" } },
    strict: false,
    tokens: true,
  });
  return tokens.some((token) => token.kind === "option" && token.name === "help");
}
