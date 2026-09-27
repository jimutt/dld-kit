import { indexPath, renderIndex, writeIndex } from "../../core/index-file.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const createEmptyIndexCommand: Command = {
  name: "create-empty-index",
  summary: "Write an INDEX.md with no decisions",
  internal: true,
  usage:
    "Usage: dld create-empty-index\n\nWrite INDEX.md in the decisions directory with only the table header.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    const { config, paths } = loadProject(ctx);
    writeIndex(ctx, paths, renderIndex([], config.mode));
    io.stdout(`Created ${indexPath(paths)}\n`);
    return EXIT_OK;
  },
};
