import { nextId } from "../../core/ids.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const nextIdCommand: Command = {
  name: "next-id",
  summary: "Print the next sequential decision ID",
  internal: true,
  usage: "Usage: dld next-id\n\nPrint the next decision ID, e.g. DL-004.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    const { paths } = loadProject(ctx);
    io.stdout(`${nextId(ctx, paths.recordsDir)}\n`);
    return EXIT_OK;
  },
};
