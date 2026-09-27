import { createDecision } from "../../core/decisions.ts";
import { DldError } from "../../core/errors.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const createDecisionCommand: Command = {
  name: "create-decision",
  summary: "Create a proposed decision record",
  internal: true,
  usage: `Usage: dld create-decision --id <DL-NNN> --title <title> [options]

Create a decision record with status proposed and print its path.

Options:
  --id <DL-NNN>            Decision ID (required)
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
    if (id === undefined || id === "" || title === undefined || title === "") {
      throw new DldError("--id and --title are required.");
    }
    const namespace = values.namespace === "" ? undefined : values.namespace;
    const path = createDecision(ctx, loadProject(ctx), {
      id,
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
