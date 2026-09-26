import { version } from "../../../package.json";
import { findProjectRoot } from "../../core/project.ts";
import { HARNESS_NAMES, targetsFor } from "../../generate/harnesses.ts";
import { applyInstall, planInstall } from "../../generate/install.ts";
import { installedRuleChannels } from "../../generate/rule.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";
import { AGENT_HELP, parseAgents, printReport } from "../install.ts";

// @decision(DL-045)
export const installRuleCommand: Command = {
  name: "install-rule",
  summary: "Install the always-on DLD rule for the named agents",
  usage: `Usage: dld install-rule --agent <names> [--force]

Install the always-on DLD rule for the named agents, and refresh any rule already installed.
Skills are not touched; use dld init or dld update for those.

Options:
  --agent <names>  Agents to install the rule for
  --force          Replace a rule installed by a newer dld-kit

${AGENT_HELP}
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: { agent: { type: "string", multiple: true }, force: { type: "boolean" } },
    });
    const requested = parseAgents(values.agent);
    const root = findProjectRoot(ctx);
    const rules = new Set([...installedRuleChannels(ctx, root), ...targetsFor(requested).rules]);
    if (rules.size === 0) {
      throw new UsageError(`name the agents with --agent (${HARNESS_NAMES.join(", ")})`);
    }
    const plan = planInstall(ctx, root, {
      layouts: new Set(),
      rules,
      version,
      force: values.force === true,
      codex: requested.some((harness) => harness.name === "codex"),
    });
    const report = applyInstall(ctx, root, plan);
    printReport(io, report);
    if (report.ruleWritten.length === 0 && report.ruleRemoved.length === 0) {
      io.stdout("The DLD rule is up to date.\n");
    }
    return EXIT_OK;
  },
};
