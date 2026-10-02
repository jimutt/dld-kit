import { editBase, restoreDecisionProse } from "../../core/decision-edits.ts";
import { loadProject } from "../../core/project.ts";
import { DECISION_ID } from "../../core/records.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";
import { baseOption } from "./base-option.ts";

// @decision(DL-068)
export const restoreDecisionProseCommand: Command = {
  name: "restore-decision-prose",
  summary: "Restore the body of decisions already on the base branch",
  internal: true,
  usage: `Usage: dld restore-decision-prose [--base <ref>] [--uncommitted] <DL-NNN> [DL-NNN ...]

Put back the body (the text after the frontmatter), id and timestamp of each decision as
they are at the merge-base of the base branch and HEAD, keeping the rest of the current
frontmatter. A deleted decision
is restored whole and staged. Fails for a draft.

Options:
  --base <ref>     Base ref (default: the branch's upstream base, else origin/main or main)
  --uncommitted    Restore from HEAD instead of the merge-base: undo only uncommitted edits
`,
  run(args, io, ctx) {
    const { values, positionals: ids } = parseCommandArgs({
      args: [...args],
      options: { base: { type: "string" }, uncommitted: { type: "boolean" } },
      allowPositionals: true,
    });
    if (ids.length === 0) throw new UsageError("expected at least one decision ID");
    const bad = ids.find((id) => !DECISION_ID.test(id));
    if (bad !== undefined) throw new UsageError(`expected decision IDs like DL-001, got '${bad}'`);
    const project = loadProject(ctx);
    const base = editBase(
      ctx,
      project.paths,
      values.base === undefined ? undefined : baseOption(values.base),
    );
    const uncommitted = values.uncommitted === true;
    for (const path of restoreDecisionProse(ctx, project, base, ids, { uncommitted })) {
      io.stdout(`Restored ${path}\n`);
    }
    return EXIT_OK;
  },
};
