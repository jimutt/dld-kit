import { loadProject } from "../../core/project.ts";
import { listTakenIds } from "../../core/reindex.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";
import { baseOption, skippedNotice } from "./base-option.ts";

export const listTakenIdsCommand: Command = {
  name: "list-taken-ids",
  summary: "List decision IDs taken on the base branch and in open PRs",
  usage: `Usage: dld list-taken-ids [--base <ref>]

Print the decision IDs on the base branch and in records touched by open pull requests
(via gh, when available), one per line, sorted.

Options:
  --base <ref>  Base ref (default: origin/main)
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    const base = baseOption(values.base);
    const { ids, skipped } = listTakenIds(ctx, loadProject(ctx), base);
    for (const id of ids) io.stdout(`${id}\n`);
    if (skipped !== undefined) io.stderr(skippedNotice(skipped));
    return EXIT_OK;
  },
};
