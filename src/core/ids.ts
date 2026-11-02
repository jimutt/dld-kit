import type { Context } from "./context.ts";
import { listRecordFiles, recordNumber } from "./records.ts";

// @decision(DL-078)
export function formatId(n: number): string {
  return `DL-${String(n).padStart(3, "0")}`;
}

// @decision(DL-078)
/** True for an ID in its one canonical spelling: DL-001, DL-042, DL-1000; not DL-5 or DL-0042. */
export function isCanonicalId(id: string): boolean {
  return /^DL-(\d{3}|[1-9]\d{3,})$/.test(id);
}

// @decision(DL-078)
/** The canonical spelling of an ID written another way (`DL-5`, `dl-0042`), when there is one. */
export function canonicalSpelling(id: string): string | undefined {
  const digits = /^dl-(\d+)$/i.exec(id)?.[1];
  if (digits === undefined) return undefined;
  const number = Number(digits);
  return Number.isSafeInteger(number) ? formatId(number) : undefined;
}

export function nextId(ctx: Context, recordsDir: string): string {
  const highest = listRecordFiles(ctx, recordsDir)
    .map(recordNumber)
    .reduce((max, n) => Math.max(max, n), 0);
  return formatId(highest + 1);
}
