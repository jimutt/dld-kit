import { version } from "../../package.json";
import type { Context } from "../core/context.ts";
import { DldError } from "../core/errors.ts";
import { type Command, EXIT_OK, EXIT_USAGE, type Io, UsageError } from "./command.ts";
import { nextIdCommand } from "./commands/next-id.ts";

export const COMMANDS: readonly Command[] = [nextIdCommand];

function usage(commands: readonly Command[]): string {
  return `Usage: dld <command> [options]

Commands:
${commands.map((c) => `  ${c.name.padEnd(20)} ${c.summary}`).join("\n")}

Options:
  -h, --help     Show this help, or a command's help after its name
  -v, --version  Show the dld version
`;
}

// @decision(DL-007) @decision(DL-012)
export function run(
  argv: readonly string[],
  io: Io,
  ctx: Context,
  commands: readonly Command[] = COMMANDS,
): number {
  const [first, ...rest] = argv;
  if (first === undefined) {
    io.stderr(usage(commands));
    return EXIT_USAGE;
  }
  if (first === "-h" || first === "--help") {
    io.stdout(usage(commands));
    return EXIT_OK;
  }
  if (first === "-v" || first === "--version") {
    io.stdout(`${version}\n`);
    return EXIT_OK;
  }

  const command = commands.find((c) => c.name === first);
  if (command === undefined) {
    io.stderr(`dld: unknown command or option '${first}'\n\n${usage(commands)}`);
    return EXIT_USAGE;
  }
  if (wantsHelp(rest)) {
    io.stdout(command.usage);
    return EXIT_OK;
  }

  try {
    return command.run(rest, io, ctx);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`dld ${command.name}: ${error.message}\n\n${command.usage}`);
      return error.exitCode;
    }
    if (error instanceof DldError) {
      io.stderr(`Error: ${error.message}\n`);
      return error.exitCode;
    }
    io.stderr(`dld: unexpected error (this is a bug)\n${describe(error)}\n`);
    return 1;
  }
}

function wantsHelp(args: readonly string[]): boolean {
  for (const arg of args) {
    if (arg === "--") return false;
    if (arg === "-h" || arg === "--help") return true;
  }
  return false;
}

function describe(error: unknown): string {
  return error instanceof Error ? (error.stack ?? String(error)) : String(error);
}
