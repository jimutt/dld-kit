import type { Context } from "./context.ts";
import { listRecordFiles, recordNumber } from "./records.ts";

export function formatId(n: number): string {
  return `DL-${String(n).padStart(3, "0")}`;
}

export function nextId(ctx: Context, recordsDir: string): string {
  const highest = listRecordFiles(ctx, recordsDir)
    .map(recordNumber)
    .reduce((max, n) => Math.max(max, n), 0);
  return formatId(highest + 1);
}
