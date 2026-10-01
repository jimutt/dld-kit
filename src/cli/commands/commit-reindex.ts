import { commitReindex } from "../../core/commit-reindex.ts";
import { DldError } from "../../core/errors.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";
import { baseOption } from "./base-option.ts";

export const commitReindexCommand: Command = {
  name: "commit-reindex",
  summary: "Commit the renamed decisions",
  internal: true,
  usage: `Usage: dld commit-reindex --base <ref> [--squash] < plan

Read a rename plan on standard input and commit the renames, which rename-decision has
already applied. By default this adds one commit on top of HEAD with the plan's paths and
every tracked file changed since HEAD; untracked files are left out. On failure the index is
restored.

With --squash, the branch's commits since the merge-base with <ref> are squashed into one
reindex commit instead, and INDEX.md is left at its merge-base state. On failure the branch,
index and INDEX.md are restored.

Options:
  --base <ref>  Base ref (required)
  --squash      Squash the branch instead of adding a commit
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: { base: { type: "string" }, squash: { type: "boolean" } },
    });
    if (!values.base) throw new DldError("--base is required.");
    const base = baseOption(values.base);
    const project = loadProject(ctx);
    const { commit, onto } = commitReindex(ctx, project, ctx.readStdin(), base, {
      squash: values.squash === true,
    });
    io.stdout(`Created reindex commit ${commit} on top of ${onto}\n`);
    return EXIT_OK;
  },
};
