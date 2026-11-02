import { findMissingAmends } from "../../core/audit.ts";
import { loadProject } from "../../core/project.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";

// @decision(DL-082)
export const findMissingAmendsCommand: Command = {
  name: "find-missing-amends",
  summary: "List decision IDs mentioned in a body but not declared",
  internal: true,
  usage: `Usage: dld find-missing-amends [--all] [--mentions] [DL-NNN ...]

Print <source-id>:<referenced-id><TAB><tier> for each decision ID a record's body mentions
without listing it in supersedes or amends. Tiers:

  explicit  a sentence says the record amends or supersedes it
  cue       a sentence in Decision or Consequences mentions it with a change word
  mention   any other mention (only with --mentions)

Only records changed since the last audit are checked, unless --all or IDs are given.

Options:
  --all       Check every record
  --mentions  Also list plain mentions
`,
  run(args, io, ctx) {
    const { values, positionals: ids } = parseCommandArgs({
      args: [...args],
      options: { all: { type: "boolean" }, mentions: { type: "boolean" } },
      allowPositionals: true,
    });
    const all = values.all === true;
    if (all && ids.length > 0) throw new UsageError("--all cannot be combined with decision IDs.");
    const found = findMissingAmends(ctx, loadProject(ctx), {
      all,
      mentions: values.mentions === true,
      ...(ids.length > 0 ? { ids } : {}),
    });
    for (const { source, referenced, tier } of found) {
      io.stdout(`${source}:${referenced}\t${tier}\n`);
    }
    return EXIT_OK;
  },
};
