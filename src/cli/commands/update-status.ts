import { updateStatus } from "../../core/decisions.ts";
import { DldError } from "../../core/errors.ts";
import { loadProject } from "../../core/project.ts";
import { isStatus, STATUSES } from "../../core/records.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";

export const updateStatusCommand: Command = {
  name: "update-status",
  summary: "Set a decision's status",
  usage: `Usage: dld update-status <DL-NNN> <${STATUSES.join("|")}>\n\nChange only the status line of a decision record.\n`,
  run(args, io, ctx) {
    const { positionals } = parseCommandArgs({
      args: [...args],
      options: {},
      allowPositionals: true,
    });
    const [id, status, ...extra] = positionals;
    if (id === undefined || status === undefined)
      throw new UsageError("expected <DL-NNN> <status>");
    if (extra.length > 0) throw new UsageError(`unexpected argument '${extra[0]}'`);
    if (!isStatus(status)) {
      throw new DldError(
        `invalid status '${status}'. Must be: proposed, accepted, deprecated, superseded.`,
      );
    }
    updateStatus(ctx, loadProject(ctx), id, status);
    io.stdout(`Updated ${id} status to ${status}.\n`);
    return EXIT_OK;
  },
};
