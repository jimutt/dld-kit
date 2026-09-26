import { missingAnnotations } from "../../core/annotations.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";

export const EXIT_MISSING = 1;

export const verifyAnnotationsCommand: Command = {
  name: "verify-annotations",
  summary: "Check that decisions have annotations in the code",
  usage:
    "Usage: dld verify-annotations <DL-NNN> [DL-NNN ...]\n\nExit 0 if every decision has at least one annotation, 1 if any are missing.\n",
  run(args, io, ctx) {
    const { positionals: ids } = parseCommandArgs({
      args: [...args],
      options: {},
      allowPositionals: true,
    });
    if (ids.length === 0) throw new UsageError("expected at least one decision ID");
    const { config, paths } = loadProject(ctx);
    const prefix = config.annotationPrefix;
    const missing = missingAnnotations(
      ctx,
      { root: paths.root, decisionsDir: paths.decisionsDir, prefix },
      ids,
    );
    if (missing.length > 0) {
      io.stdout(`MISSING annotations in source code for: ${missing.join(" ")}\n`);
      io.stdout(
        `Every implemented decision must have at least one ${prefix}(DL-NNN) annotation in the codebase.\n`,
      );
      return EXIT_MISSING;
    }
    io.stdout("All decisions have code annotations.\n");
    return EXIT_OK;
  },
};
