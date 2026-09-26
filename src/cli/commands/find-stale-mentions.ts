import { DldError } from "../../core/errors.ts";
import { loadProject } from "../../core/project.ts";
import { findStaleMentions, formatStaleMention } from "../../core/rename.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";
import { baseOption } from "./base-option.ts";

export const findStaleMentionsCommand: Command = {
  name: "find-stale-mentions",
  summary: "List remaining mentions of renamed decision IDs",
  usage: `Usage: dld find-stale-mentions --base <ref> < plan

Read a rename plan (<path>\\t<DL-OLD>\\t<DL-NEW> per line) on standard input and print
<path>\\t<line>\\t<DL-OLD>\\t<DL-NEW>\\t<text> for each remaining DL-OLD mention in changed
files outside the decisions directory.

Options:
  --base <ref>  Base ref for the local change set (required)
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    if (!values.base) throw new DldError("--base is required.");
    const base = baseOption(values.base);
    const project = loadProject(ctx);
    for (const mention of findStaleMentions(ctx, project, ctx.readStdin(), base)) {
      io.stdout(`${formatStaleMention(mention)}\n`);
    }
    return EXIT_OK;
  },
};
