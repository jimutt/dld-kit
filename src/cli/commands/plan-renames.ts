import { loadProject } from "../../core/project.ts";
import { formatRename, planRenames } from "../../core/reindex.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";
import { baseOption, skippedNotice } from "./base-option.ts";

export const planRenamesCommand: Command = {
  name: "plan-renames",
  summary: "Plan renames that resolve decision ID collisions",
  internal: true,
  usage: `Usage: dld plan-renames [--base <ref>]

Print <path>\\t<DL-OLD>\\t<DL-NEW> for each colliding local decision, assigning the next free
IDs. Prints nothing when there are no collisions.

Options:
  --base <ref>  Base ref (default: origin/main)
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    const base = baseOption(values.base);
    const { renames, skipped } = planRenames(ctx, loadProject(ctx), base);
    for (const rename of renames) io.stdout(`${formatRename(rename)}\n`);
    if (skipped !== undefined) io.stderr(skippedNotice(skipped));
    return EXIT_OK;
  },
};
