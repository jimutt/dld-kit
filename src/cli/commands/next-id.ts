import { nextId } from "../../core/new-ids.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const nextIdCommand: Command = {
  name: "next-id",
  summary: "Print the next decision ID",
  internal: true,
  usage:
    "Usage: dld next-id\n\nPrint the next decision ID in the project's id_format: DL-004, or a timestamp ID such as\nDL-T1k3m9z2p7xq4.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    io.stdout(`${nextId(ctx, loadProject(ctx))}\n`);
    return EXIT_OK;
  },
};
