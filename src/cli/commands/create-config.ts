import { createConfig, parseIdFormat, parseMode } from "../../core/init.ts";
import { findProjectRoot } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";

export const createConfigCommand: Command = {
  name: "create-config",
  summary: "Create dld.config.yaml at the project root",
  internal: true,
  usage: `Usage: dld create-config [--id-format <form>] <flat|namespaced> [namespace ...]

Create dld.config.yaml. Namespaced mode needs at least one namespace.

Options:
  --id-format <form>  sequential (DL-001, the default when left out) or timestamp
                      (DL-T1k3m9z2p7xq4, which does not clash between branches)
`,
  run(args, io, ctx) {
    const { positionals, values } = parseCommandArgs({
      args: [...args],
      options: { "id-format": { type: "string" } },
      allowPositionals: true,
    });
    const [mode, ...namespaces] = positionals;
    if (mode === undefined) throw new UsageError("missing <flat|namespaced>");
    // @decision(DL-100)
    const idFormat =
      values["id-format"] === undefined ? undefined : parseIdFormat(values["id-format"]);
    const path = createConfig(ctx, findProjectRoot(ctx), parseMode(mode), namespaces, idFormat);
    io.stdout(`Created ${path}\n`);
    return EXIT_OK;
  },
};
