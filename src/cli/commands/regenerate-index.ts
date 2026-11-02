import { basename, relative } from "node:path";
import { DldError } from "../../core/errors.ts";
import { collectIndexRows, renderIndex, writeIndex } from "../../core/index-file.ts";
import { loadProject } from "../../core/project.ts";
import { duplicateRecordFiles } from "../../core/records.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

export const regenerateIndexCommand: Command = {
  name: "regenerate-index",
  summary: "Rebuild INDEX.md from the decision records",
  internal: true,
  usage: `Usage: dld regenerate-index [--include-base <ref>]

Rebuild INDEX.md from every decision record.

Options:
  --include-base <ref>  Also list records that exist only on this git ref
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: { "include-base": { type: "string" } },
    });
    const { config, paths } = loadProject(ctx);
    if (!ctx.fs.isDirectory(paths.recordsDir)) {
      throw new DldError(`records directory not found at ${paths.recordsDir}`);
    }
    // @decision(DL-080)
    for (const files of duplicateRecordFiles(ctx, paths.recordsDir)) {
      const ids = [...new Set(files.map((path) => basename(path, ".md")))].join(" / ");
      const shown = files.map((path) => relative(paths.root, path)).join(", ");
      ctx.warn(`${ids} is in more than one file: ${shown}`);
    }
    const rows = collectIndexRows(ctx, paths, values["include-base"]);
    writeIndex(ctx, paths, renderIndex(rows, config.mode));
    io.stdout(rows.length === 0 ? "INDEX.md regenerated (empty).\n" : "INDEX.md regenerated.\n");
    return EXIT_OK;
  },
};
