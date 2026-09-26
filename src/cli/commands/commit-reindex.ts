import { commitReindex } from "../../core/commit-reindex.ts";
import { DldError } from "../../core/errors.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";
import { baseOption } from "./base-option.ts";

export const commitReindexCommand: Command = {
  name: "commit-reindex",
  summary: "Squash the branch into one reindex commit",
  usage: `Usage: dld commit-reindex --base <ref> < plan

Read a rename plan on standard input and squash the branch's commits since the merge-base
with <ref> into one reindex commit. INDEX.md is left at its merge-base state. On failure the
branch, index and INDEX.md are restored.

Options:
  --base <ref>  Base ref (required)
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    if (!values.base) throw new DldError("--base is required.");
    const base = baseOption(values.base);
    const project = loadProject(ctx);
    const { commit, onto } = commitReindex(ctx, project, ctx.readStdin(), base);
    io.stdout(`Created reindex commit ${commit} on top of ${onto}\n`);
    return EXIT_OK;
  },
};
