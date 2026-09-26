import { resolveBase } from "../../core/reindex.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const resolveBaseCommand: Command = {
  name: "resolve-base",
  summary: "Print the base ref to check decision IDs against",
  usage: `Usage: dld resolve-base

Print the current branch's upstream when it tracks a differently named branch, otherwise
origin/main.
`,
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    io.stdout(`${resolveBase(ctx)}\n`);
    return EXIT_OK;
  },
};
