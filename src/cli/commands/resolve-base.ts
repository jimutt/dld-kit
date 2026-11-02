import { join } from "node:path";
import { CONFIG_FILE, loadConfig } from "../../core/config.ts";
import { findProjectRoot } from "../../core/project.ts";
import { resolveBase } from "../../core/reindex.ts";
import { type Command, EXIT_OK, parseCommandArgs } from "../command.ts";

// @decision(DL-071)
export const resolveBaseCommand: Command = {
  name: "resolve-base",
  summary: "Print the base ref to check decision IDs against",
  internal: true,
  usage: `Usage: dld resolve-base

Print the base ref: base_branch from dld.config.yaml (origin/<name>, else <name>); else the
current branch's upstream when it tracks a differently named branch; else origin/HEAD; else
origin/main, then main, then origin/master, then master. Only a ref that exists is printed;
when none does, exit 1.
`,
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    const root = findProjectRoot(ctx);
    const config = ctx.fs.exists(join(root, CONFIG_FILE)) ? loadConfig(ctx, root) : undefined;
    io.stdout(`${resolveBase(ctx, config?.baseBranch)}\n`);
    return EXIT_OK;
  },
};
