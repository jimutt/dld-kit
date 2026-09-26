import { formatAnnotation, scanAnnotations, scanOptionsFor } from "../../core/annotations.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const findAnnotationsCommand: Command = {
  name: "find-annotations",
  summary: "List every annotation in the codebase",
  usage:
    "Usage: dld find-annotations\n\nPrint <file>:<line>:<DL-NNN> for every annotation, one per line.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    for (const annotation of scanAnnotations(ctx, scanOptionsFor(loadProject(ctx)))) {
      io.stdout(`${formatAnnotation(annotation)}\n`);
    }
    return EXIT_OK;
  },
};
