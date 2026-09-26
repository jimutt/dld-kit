import { updateAuditState } from "../../core/audit.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const updateAuditStateCommand: Command = {
  name: "update-audit-state",
  summary: "Record the audit run in .dld-state.yaml",
  usage:
    "Usage: dld update-audit-state\n\nRecord the current time and HEAD commit as the last audit.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    const { timestamp, commit } = updateAuditState(ctx, loadProject(ctx));
    io.stdout(`Audit state updated: ${timestamp} at ${commit}\n`);
    return EXIT_OK;
  },
};
