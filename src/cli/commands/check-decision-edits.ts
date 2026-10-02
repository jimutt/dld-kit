import { checkDecisionEdits, editBase, formatRecordEdit } from "../../core/decision-edits.ts";
import { loadProject } from "../../core/project.ts";
import { DECISION_ID } from "../../core/records.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";
import { baseOption } from "./base-option.ts";

/** Distinct from errors (1) and usage errors (2), so CI can tell "blocked" apart. */
export const EXIT_BLOCKED = 3;

// @decision(DL-066) @decision(DL-067)
export const checkDecisionEditsCommand: Command = {
  name: "check-decision-edits",
  summary: "List edits to the prose of decisions already on the base branch",
  internal: true,
  usage: `Usage: dld check-decision-edits [--base <ref>] [--uncommitted] [DL-NNN ...]

A decision is integrated when it exists at the merge-base of the base branch and HEAD;
otherwise it is a draft (so is one still proposed there). Without IDs, print
<path>\\t<DL-NNN>\\tedited for each integrated decision whose body (the text after the
frontmatter), id or timestamp changed, and deleted for each that is gone. With IDs, print one line per ID with its state: draft, integrated, edited or deleted.

Without IDs, exits 3 when decision_edits is block (the default) and an edited or deleted
decision was printed. With IDs, and otherwise, exits 0.

Options:
  --base <ref>     Base ref (default: the branch's upstream base, else origin/main or main)
  --uncommitted    Compare with HEAD instead of the merge-base: only uncommitted changes
`,
  run(args, io, ctx) {
    const { values, positionals: ids } = parseCommandArgs({
      args: [...args],
      options: { base: { type: "string" }, uncommitted: { type: "boolean" } },
      allowPositionals: true,
    });
    const bad = ids.find((id) => !DECISION_ID.test(id));
    if (bad !== undefined) throw new UsageError(`expected decision IDs like DL-001, got '${bad}'`);
    const project = loadProject(ctx);
    const base = editBase(
      ctx,
      project.paths,
      values.base === undefined ? undefined : baseOption(values.base),
    );
    const edits = checkDecisionEdits(ctx, project, base, ids, {
      uncommitted: values.uncommitted === true,
    });
    for (const edit of edits) io.stdout(`${formatRecordEdit(edit)}\n`);
    const changed = edits.some(({ state }) => state === "edited" || state === "deleted");
    const blocked = ids.length === 0 && changed && project.config.decisionEdits === "block";
    return blocked ? EXIT_BLOCKED : EXIT_OK;
  },
};
