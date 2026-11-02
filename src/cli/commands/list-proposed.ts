import { DldError } from "../../core/errors.ts";
import { loadProject } from "../../core/project.ts";
import { formatProposed, listProposed } from "../../core/proposed.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";
import { baseOption, DEFAULT_BASE_HELP } from "./base-option.ts";

// @decision(DL-076) @decision(DL-090)
export const listProposedCommand: Command = {
  name: "list-proposed",
  summary: "List proposed decisions, marking those added on this branch",
  internal: true,
  usage: `Usage: dld list-proposed [--base <ref>]

Print <DL-NNN>\\t<branch|base|unknown>\\t<title> for each proposed decision, ascending by ID:
branch when its file does not exist at the merge-base with the base branch (added on this
branch, committed or not), base otherwise. Without --base, when no base branch is found, every
decision is listed as unknown, with a warning.

Options:
  --base <ref>  Base ref (${DEFAULT_BASE_HELP})
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    const project = loadProject(ctx);
    let base: string | undefined;
    try {
      base = baseOption(values.base, { ctx, project });
    } catch (error) {
      const explicit = values.base !== undefined || project.config.baseBranch !== undefined;
      if (explicit || !(error instanceof DldError)) throw error;
      ctx.warn(`${error.message} Listing every proposed decision as unknown.`);
    }
    for (const proposed of listProposed(ctx, project, base)) {
      io.stdout(`${formatProposed(proposed)}\n`);
    }
    return EXIT_OK;
  },
};
