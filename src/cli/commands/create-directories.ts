import { createDirectories } from "../../core/init.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const createDirectoriesCommand: Command = {
  name: "create-directories",
  summary: "Create the decisions directory structure from the config",
  internal: true,
  usage:
    "Usage: dld create-directories\n\nCreate the decisions and records directories, and one per namespace.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    createDirectories(ctx, loadProject(ctx));
    io.stdout("Created decisions directory structure.\n");
    return EXIT_OK;
  },
};
