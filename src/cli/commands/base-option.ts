import { DEFAULT_BASE } from "../../core/reindex.ts";
import { UsageError } from "../command.ts";

// @decision(DL-027)
/** The `--base` value, or the default. A value that looks like an option is a usage error. */
export function baseOption(value: string | undefined, fallback = DEFAULT_BASE): string {
  const base = value ?? fallback;
  if (base.startsWith("-")) throw new UsageError(`--base must be a git ref, got '${base}'`);
  return base;
}

/** The notice printed when the open-PR scan was skipped (DL-026). */
export function skippedNotice(reason: string): string {
  return `[dld-reindex] open PRs not scanned: ${reason}\n`;
}
