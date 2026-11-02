import { loadProject } from "../../core/project.ts";
import { findCollisions } from "../../core/reindex.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";
import { baseOption, DEFAULT_BASE_HELP, skippedNotice } from "./base-option.ts";

export const findCollisionsCommand: Command = {
  name: "find-collisions",
  summary: "List locally added decisions whose IDs are taken",
  internal: true,
  usage: `Usage: dld find-collisions [--base <ref>]

Print <path>\\t<DL-NNN> for each decision added on this branch whose ID is taken on the base
branch or in an open pull request.

Options:
  --base <ref>  Base ref (${DEFAULT_BASE_HELP})
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    const project = loadProject(ctx);
    const base = baseOption(values.base, { ctx, project });
    const { collisions, skipped } = findCollisions(ctx, project, base);
    for (const { path, id } of collisions) io.stdout(`${path}\t${id}\n`);
    if (skipped !== undefined) io.stderr(skippedNotice(skipped));
    return EXIT_OK;
  },
};
