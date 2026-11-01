import { loadProject } from "../../core/project.ts";
import { collectActiveDecisions } from "../../core/snapshot.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

// @decision(DL-070)
export const collectActiveDecisionsCommand: Command = {
  name: "collect-active-decisions",
  summary: "Print every accepted decision record",
  internal: true,
  usage: `Usage: dld collect-active-decisions [--include-proposed]

Print each accepted record in ID order, separated by ===DLD_DECISION_BOUNDARY=== lines.

Options:
  --include-proposed  Print proposed records too, in the same ID order
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: { "include-proposed": { type: "boolean" } },
    });
    io.stdout(
      collectActiveDecisions(ctx, loadProject(ctx), {
        includeProposed: values["include-proposed"] === true,
      }),
    );
    return EXIT_OK;
  },
};
