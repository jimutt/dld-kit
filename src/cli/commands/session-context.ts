import { findProjectRoot } from "../../core/project.ts";
import { HARNESS_NAMES } from "../../generate/harnesses.ts";
import { sessionContext } from "../../generate/rule.ts";
import { type Command, EXIT_OK, parseCommandArgs, UsageError } from "../command.ts";
import { parseAgents } from "../install.ts";

// @decision(DL-049)
export const sessionContextCommand: Command = {
  name: "session-context",
  summary: "Print the DLD rule for a session hook, unless the agent loads it already",
  usage: `Usage: dld session-context --agent <name>

Print the always-on DLD rule, for a harness hook that adds it to the session context.
Prints nothing outside a project with dld.config.yaml, or when the agent already loads
the rule there (its rule file, or the dld-kit block in the instruction file it reads).
Never fails the session: other errors print one line on stderr and exit 0.

Options:
  --agent <name>  The agent whose session this is

Agents: ${HARNESS_NAMES.join(", ")}.
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: { agent: { type: "string" } },
    });
    const [harness, ...others] = parseAgents(values.agent === undefined ? [] : [values.agent]);
    if (harness === undefined || others.length > 0) {
      throw new UsageError(`name one agent with --agent (${HARNESS_NAMES.join(", ")})`);
    }
    let root: string;
    try {
      root = findProjectRoot(ctx);
    } catch {
      return EXIT_OK;
    }
    try {
      const text = sessionContext(ctx, root, harness);
      if (text !== undefined) io.stdout(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr(`dld session-context: ${message}\n`);
    }
    return EXIT_OK;
  },
};
