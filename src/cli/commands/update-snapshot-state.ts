import { formatId } from "../../core/ids.ts";
import { loadProject } from "../../core/project.ts";
import { updateSnapshotState } from "../../core/snapshot.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const updateSnapshotStateCommand: Command = {
  name: "update-snapshot-state",
  summary: "Record the snapshot run in .dld-state.yaml",
  internal: true,
  usage: `Usage: dld update-snapshot-state [artifact ...]

Record the snapshot time, HEAD commit and highest accepted decision, with timestamps for
SNAPSHOT.md, OVERVIEW.md and any custom artifacts named.
`,
  run(args, io, ctx) {
    const { positionals } = parseCommandArgs({
      args: [...args],
      options: {},
      allowPositionals: true,
    });
    const { timestamp, commit, highest } = updateSnapshotState(ctx, loadProject(ctx), positionals);
    io.stdout(`Snapshot state updated: ${timestamp} at ${commit} (through ${formatId(highest)})\n`);
    return EXIT_OK;
  },
};
