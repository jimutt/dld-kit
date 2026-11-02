import { loadProject } from "../../core/project.ts";
import { listTakenIds } from "../../core/reindex.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";
import { baseOption, DEFAULT_BASE_HELP, skippedNotice } from "./base-option.ts";

export const listTakenIdsCommand: Command = {
  name: "list-taken-ids",
  summary: "List decision IDs taken on the base branch and in open PRs",
  internal: true,
  usage: `Usage: dld list-taken-ids [--base <ref>]

Print the decision IDs on the base branch and in records touched by open pull requests
(via gh, when available), one per line, sorted.

Options:
  --base <ref>  Base ref (${DEFAULT_BASE_HELP})
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    const project = loadProject(ctx);
    const base = baseOption(values.base, { ctx, project });
    const { ids, skipped } = listTakenIds(ctx, project, base);
    for (const id of ids) io.stdout(`${id}\n`);
    if (skipped !== undefined) io.stderr(skippedNotice(skipped));
    return EXIT_OK;
  },
};
