import { indexPath, renderIndex, writeIndex } from "../../core/index-file.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";
import { ensureIndexMergeAttribute } from "../install.ts";

export const createEmptyIndexCommand: Command = {
  name: "create-empty-index",
  summary: "Write an INDEX.md with no decisions",
  internal: true,
  usage:
    "Usage: dld create-empty-index\n\nWrite INDEX.md in the decisions directory with only the table header, and add its\nunion-merge line to .gitattributes.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    const project = loadProject(ctx);
    const { config, paths } = project;
    writeIndex(ctx, paths, renderIndex([], config.mode));
    io.stdout(`Created ${indexPath(paths)}\n`);
    // @decision(DL-075)
    ensureIndexMergeAttribute(io, ctx, project);
    return EXIT_OK;
  },
};
