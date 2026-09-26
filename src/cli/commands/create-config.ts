import { createConfig, parseMode } from "../../core/init.ts";
import { findProjectRoot } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";

export const createConfigCommand: Command = {
  name: "create-config",
  summary: "Create dld.config.yaml at the project root",
  internal: true,
  usage:
    "Usage: dld create-config <flat|namespaced> [namespace ...]\n\nCreate dld.config.yaml. Namespaced mode needs at least one namespace.\n",
  run(args, io, ctx) {
    const { positionals } = parseCommandArgs({
      args: [...args],
      options: {},
      allowPositionals: true,
    });
    const [mode, ...namespaces] = positionals;
    if (mode === undefined) throw new UsageError("missing <flat|namespaced>");
    const path = createConfig(ctx, findProjectRoot(ctx), parseMode(mode), namespaces);
    io.stdout(`Created ${path}\n`);
    return EXIT_OK;
  },
};
