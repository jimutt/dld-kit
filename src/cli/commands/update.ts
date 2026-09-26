import { join } from "node:path";
import { version } from "../../../package.json";
import { CONFIG_FILE } from "../../core/config.ts";
import { DldError } from "../../core/errors.ts";
import { findProjectRoot } from "../../core/project.ts";
import { HARNESS_NAMES, targetsFor } from "../../generate/harnesses.ts";
import {
  applyInstall,
  installedTargets,
  missingAgentsRuleWarning,
  packageSource,
  planInstall,
} from "../../generate/install.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";
import { AGENT_HELP, cliPath, parseAgents, printReport } from "../install.ts";

// @decision(DL-040) @decision(DL-043)
export const updateCommand: Command = {
  name: "update",
  summary: "Refresh the installed DLD skills and rule to this version",
  usage: `Usage: dld update [--agent <names>] [--force]

Rewrite the DLD skills and always-on rule already installed in this project with this version
of dld-kit, and install them for any agents named with --agent. Decision records and
dld.config.yaml are never changed.

Options:
  --agent <names>  Also install for these agents
  --force          Replace files installed by a newer dld-kit

${AGENT_HELP}
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: { agent: { type: "string", multiple: true }, force: { type: "boolean" } },
    });
    const requested = parseAgents(values.agent);
    const root = findProjectRoot(ctx);
    if (!ctx.fs.lexists(join(root, CONFIG_FILE))) {
      throw new DldError(`DLD is not set up here (${CONFIG_FILE} not found). Run dld init first.`);
    }
    const installed = installedTargets(ctx, root);
    const added = targetsFor(requested);
    const layouts = new Set([...installed.layouts, ...added.layouts]);
    const rules = new Set([...installed.rules, ...added.rules]);
    if (layouts.size === 0 && rules.size === 0) {
      throw new UsageError(
        `no DLD skills or rule are installed yet; name the agents with --agent (${HARNESS_NAMES.join(", ")})`,
      );
    }
    const plan = planInstall(ctx, root, {
      source: layouts.size > 0 ? packageSource(ctx, cliPath(io), "update") : undefined,
      layouts,
      rules,
      version,
      force: values.force === true,
      codex: requested.some((harness) => harness.name === "codex"),
    });
    const report = applyInstall(ctx, root, plan);
    report.warnings.push(...missingAgentsRuleWarning({ layouts, rules }));
    printReport(io, report);
    return EXIT_OK;
  },
};
