import { relative, sep } from "node:path";
import type { Context } from "../core/context.ts";
import { DldError } from "../core/errors.ts";
import { indexPath } from "../core/index-file.ts";
import type { Project } from "../core/project.ts";
import {
  applyIndexMergeAttribute,
  GITATTRIBUTES,
  planIndexMergeAttribute,
} from "../generate/gitattributes.ts";
import {
  type Detection,
  findHarness,
  HARNESS_NAMES,
  HARNESSES,
  type Harness,
} from "../generate/harnesses.ts";
import type { InstallReport } from "../generate/install.ts";
import { CLAUDE_IMPORT_FILE } from "../generate/rule.ts";
import { type Io, UsageError } from "./command.ts";

/** Help text shared by the commands that take `--agent`. */
export const AGENT_HELP = `Agents: ${HARNESS_NAMES.join(", ")}. --agent takes a comma-separated list and can be repeated.`;

// @decision(DL-041)
/** The harnesses named by `--agent` values, in table order. Unknown names are a usage error. */
export function parseAgents(values: readonly string[] | undefined): Harness[] {
  const names = (values ?? []).flatMap((value) => value.split(",")).map((name) => name.trim());
  const harnesses = new Set<Harness>();
  for (const name of names) {
    if (name === "") continue;
    const harness = findHarness(name);
    if (harness === undefined) {
      throw new UsageError(`unknown agent '${name}'; expected one of: ${HARNESS_NAMES.join(", ")}`);
    }
    harnesses.add(harness);
  }
  return HARNESSES.filter((harness) => harnesses.has(harness));
}

// @decision(DL-041)
/**
 * The harnesses to install for: the detected ones plus `requested`. On an interactive terminal,
 * unless `yes`, the user confirms or changes the selection first.
 */
export async function selectHarnesses(
  io: Io,
  detected: readonly Detection[],
  requested: readonly Harness[],
  yes: boolean,
): Promise<Harness[]> {
  const selected = new Set<Harness>([...detected.map((d) => d.harness), ...requested]);
  const ordered = () => HARNESSES.filter((harness) => selected.has(harness));
  if (io.prompt === undefined || yes) {
    if (selected.size === 0) {
      throw new UsageError(
        `no agent detected in this project; name them with --agent (${HARNESS_NAMES.join(", ")})`,
      );
    }
    return ordered();
  }
  const found = new Map(detected.map((d) => [d.harness, d.marker]));
  const width = Math.max(...HARNESS_NAMES.map((name) => name.length));
  for (;;) {
    const lines = HARNESSES.map((harness, i) => {
      const box = selected.has(harness) ? "[x]" : "[ ]";
      const marker = found.get(harness);
      const note = marker === undefined ? "" : ` (found ${marker})`;
      return `  ${i + 1}. ${box} ${harness.name.padEnd(width)}  ${harness.title}${note}\n`;
    });
    io.stdout(`Install DLD for these agents:\n${lines.join("")}`);
    const answer = (await io.prompt("Numbers to toggle, or Enter to continue: ")).trim();
    if (answer === "") {
      if (selected.size > 0) return ordered();
      io.stdout("Select at least one agent.\n");
      continue;
    }
    const picks = answer.split(/[\s,]+/).map((pick) => HARNESSES[Number(pick) - 1]);
    if (picks.some((harness) => harness === undefined)) {
      io.stdout(`Enter numbers from 1 to ${HARNESSES.length}.\n`);
      continue;
    }
    for (const harness of picks) {
      if (harness === undefined) continue;
      if (selected.has(harness)) selected.delete(harness);
      else selected.add(harness);
    }
  }
}

/** `io.cliPath`, which bin.ts always sets. */
export function cliPath(io: Io): string {
  if (io.cliPath === undefined) throw new DldError("cannot locate the running dld file");
  return io.cliPath;
}

/** Prints what an install wrote; warnings go to stderr. */
export function printReport(io: Io, report: InstallReport): void {
  for (const { dir, written, removed, unchanged, removedPaths } of report.skills) {
    io.stdout(`${dir}: ${written} written, ${removed} removed, ${unchanged} unchanged\n`);
    // @decision(DL-072)
    for (const path of removedPaths) io.stdout(`Removed ${path}\n`);
  }
  for (const path of report.ruleWritten) {
    // @decision(DL-055)
    io.stdout(
      path === CLAUDE_IMPORT_FILE
        ? `Wrote ${path} (imports AGENTS.md for Claude Code)\n`
        : `Wrote the DLD rule to ${path}\n`,
    );
  }
  for (const path of report.ruleRemoved) io.stdout(`Removed ${path} (the rule is in the block)\n`);
  for (const warning of report.warnings) io.stderr(`Warning: ${warning}\n`);
}

// @decision(DL-075)
/** Adds the union-merge line for the project's INDEX.md to .gitattributes, and reports it. */
export function ensureIndexMergeAttribute(io: Io, ctx: Context, project: Project): void {
  const { root } = project.paths;
  const index = relative(root, indexPath(project.paths)).split(sep).join("/");
  const plan = planIndexMergeAttribute(ctx, root, index);
  if (applyIndexMergeAttribute(ctx, root, plan)) {
    const verb = plan.creates === true ? "Created" : "Updated";
    io.stdout(`${verb} ${GITATTRIBUTES}: ${index} merges keep the rows from both sides\n`);
  }
  for (const warning of plan.warnings) io.stderr(`Warning: ${warning}\n`);
}
