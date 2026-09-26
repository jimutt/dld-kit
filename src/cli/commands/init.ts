import { join, relative } from "node:path";
import { version } from "../../../package.json";
import { CONFIG_FILE } from "../../core/config.ts";
import { DldError } from "../../core/errors.ts";
import { indexPath, renderIndex, writeIndex } from "../../core/index-file.ts";
import { createConfig, createDirectories } from "../../core/init.ts";
import { findProjectRoot, loadProject } from "../../core/project.ts";
import { detectHarnesses, targetsFor } from "../../generate/harnesses.ts";
import { applyInstall, packageSource, planInstall } from "../../generate/install.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";
import { AGENT_HELP, cliPath, parseAgents, printReport, selectHarnesses } from "../install.ts";

// @decision(DL-040)
export const initCommand: Command = {
  name: "init",
  summary: "Set up DLD, its skills and the always-on rule in this repository",
  usage: `Usage: dld init [--namespaces <a,b,...>] [--agent <names>] [--yes]

Create dld.config.yaml, the decisions directory and INDEX.md, then install the DLD skills and
the always-on rule for the agents used in this project.

Agents are detected from the project; --agent adds more. On an interactive terminal, init asks
you to confirm the selection unless --yes is given.

Options:
  --namespaces <a,b>  Organise decisions by these namespaces (default: one flat log)
  --agent <names>     Agents to install for, besides the detected ones
  --yes               Do not ask; use the detected agents and --agent

${AGENT_HELP}
`,
  async run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: {
        namespaces: { type: "string" },
        agent: { type: "string", multiple: true },
        yes: { type: "boolean" },
      },
    });
    const requested = parseAgents(values.agent);
    const namespaces = (values.namespaces ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== "");
    if (values.namespaces !== undefined && namespaces.length === 0) {
      throw new UsageError("--namespaces needs at least one namespace");
    }
    const root = findProjectRoot(ctx);
    if (ctx.fs.lexists(join(root, CONFIG_FILE))) {
      throw new DldError(
        `DLD is already set up here (${CONFIG_FILE} exists). Run dld update to refresh the skills and rule, or dld update --agent <name> to add an agent.`,
      );
    }
    const source = packageSource(ctx, cliPath(io), "init");
    const harnesses = await selectHarnesses(
      io,
      detectHarnesses(ctx, root),
      requested,
      values.yes === true,
    );
    const targets = targetsFor(harnesses);
    const plan = planInstall(ctx, root, {
      source,
      layouts: targets.layouts,
      rules: targets.rules,
      version,
      codex: harnesses.some((harness) => harness.name === "codex"),
    });

    createConfig(ctx, root, namespaces.length > 0 ? "namespaced" : "flat", namespaces);
    const project = loadProject(ctx);
    createDirectories(ctx, project);
    writeIndex(ctx, project.paths, renderIndex([], project.config.mode));
    const report = applyInstall(ctx, root, plan);

    const index = relative(root, indexPath(project.paths));
    io.stdout(`Created ${CONFIG_FILE} and ${index}\n`);
    printReport(io, report);
    io.stdout(
      `\nDLD is set up for: ${harnesses.map((harness) => harness.name).join(", ")}. Commit these files so everyone gets the same skills and rule.\nNext, in your agent: the dld-retrofit skill records decisions from existing code, and dld-decide records a new one.\n`,
    );
    return EXIT_OK;
  },
};
