import type { Context } from "./context.ts";
import { listRecordFiles, recordNumber } from "./records.ts";

// @decision(DL-078)
export function formatId(n: number): string {
  return `DL-${String(n).padStart(3, "0")}`;
}

// @decision(DL-078)
/** True for an ID in its one canonical spelling: DL-001, DL-042, DL-1000; not DL-5 or DL-0042. */
export function isCanonicalId(id: string): boolean {
  const digits = /^DL-(\d+)$/.exec(id)?.[1];
  return digits !== undefined && formatId(Number.parseInt(digits, 10)) === id;
}

export function nextId(ctx: Context, recordsDir: string): string {
  const highest = listRecordFiles(ctx, recordsDir)
    .map(recordNumber)
    .reduce((max, n) => Math.max(max, n), 0);
  return formatId(highest + 1);
}
