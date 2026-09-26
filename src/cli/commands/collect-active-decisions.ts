import { loadProject } from "../../core/project.ts";
import { collectActiveDecisions } from "../../core/snapshot.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const collectActiveDecisionsCommand: Command = {
  name: "collect-active-decisions",
  summary: "Print every accepted decision record",
  internal: true,
  usage:
    "Usage: dld collect-active-decisions\n\nPrint each accepted record in ID order, separated by ===DLD_DECISION_BOUNDARY=== lines.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    io.stdout(collectActiveDecisions(ctx, loadProject(ctx)));
    return EXIT_OK;
  },
};
