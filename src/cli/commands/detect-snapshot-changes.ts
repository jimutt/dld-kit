import { loadProject } from "../../core/project.ts";
import { detectSnapshotChanges, formatSnapshotChanges } from "../../core/snapshot.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const detectSnapshotChangesCommand: Command = {
  name: "detect-snapshot-changes",
  summary: "Report what changed since the last snapshot",
  internal: true,
  usage:
    "Usage: dld detect-snapshot-changes\n\nPrint mode (full or incremental), new_decisions, modified_decisions and commit_range.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    io.stdout(formatSnapshotChanges(detectSnapshotChanges(ctx, loadProject(ctx))));
    return EXIT_OK;
  },
};
