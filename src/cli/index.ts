import { version } from "../../package.json";
import type { Context } from "../core/context.ts";
import { DldError } from "../core/errors.ts";
import {
  type Command,
  EXIT_OK,
  EXIT_USAGE,
  HelpRequested,
  type Io,
  UsageError,
} from "./command.ts";
import { collectActiveDecisionsCommand } from "./commands/collect-active-decisions.ts";
import { commitReindexCommand } from "./commands/commit-reindex.ts";
import { createConfigCommand } from "./commands/create-config.ts";
import { createDecisionCommand } from "./commands/create-decision.ts";
import { createDirectoriesCommand } from "./commands/create-directories.ts";
import { createEmptyIndexCommand } from "./commands/create-empty-index.ts";
import { detectSnapshotChangesCommand } from "./commands/detect-snapshot-changes.ts";
import { findAnnotationsCommand } from "./commands/find-annotations.ts";
import { findCollisionsCommand } from "./commands/find-collisions.ts";
import { findMissingAmendsCommand } from "./commands/find-missing-amends.ts";
import { findStaleMentionsCommand } from "./commands/find-stale-mentions.ts";
import { initCommand } from "./commands/init.ts";
import { installRuleCommand } from "./commands/install-rule.ts";
import { listTakenIdsCommand } from "./commands/list-taken-ids.ts";
import { nextIdCommand } from "./commands/next-id.ts";
import { planRenamesCommand } from "./commands/plan-renames.ts";
import { regenerateIndexCommand } from "./commands/regenerate-index.ts";
import { renameDecisionCommand } from "./commands/rename-decision.ts";
import { resolveBaseCommand } from "./commands/resolve-base.ts";
import { sessionContextCommand } from "./commands/session-context.ts";
import { updateCommand } from "./commands/update.ts";
import { updateAuditStateCommand } from "./commands/update-audit-state.ts";
import { updateSnapshotStateCommand } from "./commands/update-snapshot-state.ts";
import { updateStatusCommand } from "./commands/update-status.ts";
import { verifyAnnotationsCommand } from "./commands/verify-annotations.ts";

export const COMMANDS: readonly Command[] = [
  initCommand,
  updateCommand,
  installRuleCommand,
  sessionContextCommand,
  createConfigCommand,
  createDirectoriesCommand,
  createEmptyIndexCommand,
  nextIdCommand,
  createDecisionCommand,
  updateStatusCommand,
  regenerateIndexCommand,
  verifyAnnotationsCommand,
  findAnnotationsCommand,
  findMissingAmendsCommand,
  updateAuditStateCommand,
  collectActiveDecisionsCommand,
  detectSnapshotChangesCommand,
  updateSnapshotStateCommand,
  resolveBaseCommand,
  listTakenIdsCommand,
  findCollisionsCommand,
  planRenamesCommand,
  renameDecisionCommand,
  findStaleMentionsCommand,
  commitReindexCommand,
];

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
): number | Promise<number> {
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

  try {
    const result = command.run(rest, io, ctx);
    if (typeof result === "number") return result;
    return result.catch((error: unknown) => report(error, command, io));
  } catch (error) {
    return report(error, command, io);
  }
}

/** Prints a command's failure and returns its exit code (DL-012). */
function report(error: unknown, command: Command, io: Io): number {
  if (error instanceof HelpRequested) {
    io.stdout(command.usage);
    return EXIT_OK;
  }
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

function describe(error: unknown): string {
  return error instanceof Error ? (error.stack ?? String(error)) : String(error);
}
