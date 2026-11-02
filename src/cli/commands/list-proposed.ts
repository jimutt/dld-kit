import { loadProject } from "../../core/project.ts";
import { formatProposed, listProposed } from "../../core/proposed.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";
import { baseOption, DEFAULT_BASE_HELP } from "./base-option.ts";

// @decision(DL-076)
export const listProposedCommand: Command = {
  name: "list-proposed",
  summary: "List proposed decisions, marking those added on this branch",
  internal: true,
  usage: `Usage: dld list-proposed [--base <ref>]

Print <DL-NNN>\\t<branch|base>\\t<title> for each proposed decision, ascending by ID: branch
when its file does not exist at the merge-base with the base branch (added on this branch,
committed or not), base otherwise.

Options:
  --base <ref>  Base ref (${DEFAULT_BASE_HELP})
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    const project = loadProject(ctx);
    const base = baseOption(values.base, { ctx, project });
    for (const proposed of listProposed(ctx, project, base)) {
      io.stdout(`${formatProposed(proposed)}\n`);
    }
    return EXIT_OK;
  },
};
