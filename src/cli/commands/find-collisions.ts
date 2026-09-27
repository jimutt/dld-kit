import { loadProject } from "../../core/project.ts";
import { findCollisions } from "../../core/reindex.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";
import { baseOption, skippedNotice } from "./base-option.ts";

export const findCollisionsCommand: Command = {
  name: "find-collisions",
  summary: "List locally added decisions whose IDs are taken",
  internal: true,
  usage: `Usage: dld find-collisions [--base <ref>]

Print <path>\\t<DL-NNN> for each decision added on this branch whose ID is taken on the base
branch or in an open pull request.

Options:
  --base <ref>  Base ref (default: origin/main)
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    const base = baseOption(values.base);
    const { collisions, skipped } = findCollisions(ctx, loadProject(ctx), base);
    for (const { path, id } of collisions) io.stdout(`${path}\t${id}\n`);
    if (skipped !== undefined) io.stderr(skippedNotice(skipped));
    return EXIT_OK;
  },
};
