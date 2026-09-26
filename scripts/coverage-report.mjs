// @decision(DL-020)
// Renders unit-test coverage from Bun's lcov output as markdown, with the change from a base run.
// Usage: node scripts/coverage-report.mjs --head <lcov.info> [--base <lcov.info>] [--base-label <text>]
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const MARKER = "<!-- dld-coverage-report -->";
export const FLOOR = 90;

/** Parses lcov into per-file line and function counts. */
export function parseLcov(text) {
  const files = new Map();
  let current;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const colon = line.indexOf(":");
    const key = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1);
    if (key === "SF") {
      current = { lines: { found: 0, hit: 0 }, functions: { found: 0, hit: 0 } };
      files.set(value, current);
    } else if (current !== undefined) {
      if (key === "LF") current.lines.found = Number(value);
      else if (key === "LH") current.lines.hit = Number(value);
      else if (key === "FNF") current.functions.found = Number(value);
      else if (key === "FNH") current.functions.hit = Number(value);
      else if (key === "end_of_record") current = undefined;
    }
  }
  return files;
}

function total(files) {
  const sum = { lines: { found: 0, hit: 0 }, functions: { found: 0, hit: 0 } };
  for (const file of files.values()) {
    for (const kind of ["lines", "functions"]) {
      sum[kind].found += file[kind].found;
      sum[kind].hit += file[kind].hit;
    }
  }
  return sum;
}

function percent(counts) {
  return counts.found === 0 ? 100 : (counts.hit / counts.found) * 100;
}

function cell(head, base) {
  const value = percent(head);
  const text = `${value.toFixed(2)}%`;
  const flag = value < FLOOR ? " ⚠️" : "";
  if (base === undefined) return `${text}${flag}`;
  const delta = value - percent(base);
  if (Math.abs(delta) < 0.005) return `${text}${flag}`;
  return `${text} (${delta > 0 ? "+" : ""}${delta.toFixed(2)})${flag}`;
}

export function renderReport(head, base, baseLabel) {
  const headTotal = total(head);
  const baseTotal = base === undefined ? undefined : total(base);
  const out = [MARKER, "## Unit test coverage", ""];
  out.push("| | Lines | Functions |", "|---|---|---|");
  out.push(
    `| **Total** | ${cell(headTotal.lines, baseTotal?.lines)} | ${cell(headTotal.functions, baseTotal?.functions)} |`,
  );
  out.push("");
  out.push(
    base === undefined
      ? "No base coverage to compare against (no base run, or the base has no coverage setup)."
      : `Changes are relative to ${baseLabel ?? "the base branch"}.`,
  );
  out.push(`The floor is ${FLOOR}% of lines and functions in each file; ⚠️ marks files below it.`);
  out.push("", "<details><summary>Per file</summary>", "");
  out.push("| File | Lines | Functions |", "|---|---|---|");
  const names = new Set([...head.keys(), ...(base?.keys() ?? [])]);
  for (const name of [...names].sort()) {
    const file = head.get(name);
    if (file === undefined) {
      out.push(`| \`${name}\` | removed | removed |`);
      continue;
    }
    const before = base?.get(name);
    const lines = cell(file.lines, before?.lines);
    const functions = cell(file.functions, before?.functions);
    out.push(`| \`${name}\`${base && !before ? " (new)" : ""} | ${lines} | ${functions} |`);
  }
  out.push("", "</details>", "");
  return out.join("\n");
}

function main() {
  const { values } = parseArgs({
    options: {
      head: { type: "string" },
      base: { type: "string" },
      "base-label": { type: "string" },
    },
  });
  if (values.head === undefined) {
    console.error("coverage-report: --head <lcov.info> is required");
    process.exit(2);
  }
  const head = parseLcov(readFileSync(values.head, "utf8"));
  const base =
    values.base !== undefined && existsSync(values.base)
      ? parseLcov(readFileSync(values.base, "utf8"))
      : undefined;
  process.stdout.write(renderReport(head, base, values["base-label"]));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
