import { loadProject } from "../../core/project.ts";
import { DECISION_ID } from "../../core/records.ts";
import { formatRelated, relatedDecisions } from "../../core/related.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";

// @decision(DL-077)
export const relatedDecisionsCommand: Command = {
  name: "related-decisions",
  summary:
    "List the decisions a decision amends or supersedes, and those that amend or supersede it",
  internal: true,
  usage: `Usage: dld related-decisions <DL-NNN>

Print <relation>\\t<DL-NNN>\\t<status>\\t<title> for each related decision, ascending by ID.
Relations: amends and supersedes (from the decision's own frontmatter), amended-by and
superseded-by (records whose amends or supersedes list it). A listed ID with no record has
status missing. Exits 1 if the decision does not exist.
`,
  run(args, io, ctx) {
    const { positionals } = parseCommandArgs({
      args: [...args],
      options: {},
      allowPositionals: true,
    });
    const [id, ...extra] = positionals;
    if (id === undefined || !DECISION_ID.test(id))
      throw new UsageError("expected one decision ID like DL-001");
    if (extra.length > 0) throw new UsageError(`unexpected argument '${extra[0]}'`);
    for (const related of relatedDecisions(ctx, loadProject(ctx), id)) {
      io.stdout(`${formatRelated(related)}\n`);
    }
    return EXIT_OK;
  },
};
