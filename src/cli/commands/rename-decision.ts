import { DldError } from "../../core/errors.ts";
import { loadProject } from "../../core/project.ts";
import { renameDecision } from "../../core/rename.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";
import { baseOption } from "./base-option.ts";

export const renameDecisionCommand: Command = {
  name: "rename-decision",
  summary: "Rename a local decision and rewrite its references",
  internal: true,
  usage: `Usage: dld rename-decision --old <DL-OLD> --new <DL-NEW> --path <path> [--base <ref>]

Rename a locally added decision with git mv, rewrite its id and references in changed
decision files, and rewrite annotations in changed files. Prints <path> -> <new path>.

Options:
  --old <DL-OLD>  Current ID (required)
  --new <DL-NEW>  New ID (required)
  --path <path>   Record path relative to the project root (required)
  --base <ref>    Base ref for the local change set (default: origin/main)
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: {
        old: { type: "string" },
        new: { type: "string" },
        path: { type: "string" },
        base: { type: "string" },
      },
    });
    const { old: oldId, new: newId, path } = values;
    if (!oldId || !newId || !path) throw new DldError("--old, --new, and --path are required.");
    const base = baseOption(values.base);
    const newPath = renameDecision(ctx, loadProject(ctx), { path, oldId, newId }, base);
    io.stdout(`${path} -> ${newPath}\n`);
    return EXIT_OK;
  },
};
