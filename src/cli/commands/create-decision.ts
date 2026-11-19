import { createDecision } from "../../core/decisions.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";

export const createDecisionCommand: Command = {
  name: "create-decision",
  summary: "Create a proposed decision record",
  internal: true,
  usage: `Usage: dld create-decision (--id <DL-NNN> | --auto-id) --title <title> [options]

Create a decision record with status proposed and print its path.

Options:
  --id <DL-NNN>            Decision ID, in either form
  --auto-id                Use the next ID in the project's id_format instead of --id
  --title <title>          Title (required)
  --namespace <name>       Namespace directory (namespaced projects only)
  --tags <a,b>             Comma-separated tags
  --supersedes <DL-X,...>  Decisions this one supersedes
  --amends <DL-X,...>      Decisions this one amends
  --body-stdin             Read the markdown body from standard input
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: {
        id: { type: "string" },
        "auto-id": { type: "boolean" },
        title: { type: "string" },
        namespace: { type: "string" },
        tags: { type: "string" },
        supersedes: { type: "string" },
        amends: { type: "string" },
        "body-stdin": { type: "boolean" },
      },
    });
    const body = values["body-stdin"] === true ? ctx.readStdin() : "";
    const { id, title } = values;
    // @decision(DL-095)
    const autoId = values["auto-id"] === true;
    if (autoId ? id !== undefined : id === undefined || id === "") {
      throw new UsageError("exactly one of --id and --auto-id is required.");
    }
    if (title === undefined || title === "") throw new UsageError("--title is required.");
    const namespace = values.namespace === "" ? undefined : values.namespace;
    const path = createDecision(ctx, loadProject(ctx), {
      ...(id === undefined ? {} : { id }),
      title,
      ...(namespace === undefined ? {} : { namespace }),
      tags: values.tags ?? "",
      supersedes: values.supersedes ?? "",
      amends: values.amends ?? "",
      body,
    });
    io.stdout(`${path}\n`);
    return EXIT_OK;
  },
};
