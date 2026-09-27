import { findMissingAmends } from "../../core/audit.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const findMissingAmendsCommand: Command = {
  name: "find-missing-amends",
  summary: "List decision IDs mentioned in a body but not declared",
  internal: true,
  usage: `Usage: dld find-missing-amends [--all]

Print <source-id>:<referenced-id> for each decision ID a record's body mentions without
listing it in supersedes or amends. Only records changed since the last audit are checked.

Options:
  --all  Check every record
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { all: { type: "boolean" } } });
    const found = findMissingAmends(ctx, loadProject(ctx), { all: values.all === true });
    for (const { source, referenced } of found) io.stdout(`${source}:${referenced}\n`);
    return EXIT_OK;
  },
};
