import { join } from "node:path";
import type { Context } from "./context.ts";

const RECORD_FILE = /^DL-(\d+)\.md$/;

export function formatId(n: number): string {
  return `DL-${String(n).padStart(3, "0")}`;
}

/** Numeric IDs of every `DL-NNN.md` file under `recordsDir`, at any depth. */
export function listRecordNumbers(ctx: Context, recordsDir: string): number[] {
  const numbers: number[] = [];
  const walk = (dir: string) => {
    for (const entry of ctx.fs.readDir(dir)) {
      if (entry.isDirectory) {
        walk(join(dir, entry.name));
        continue;
      }
      const match = entry.isFile ? RECORD_FILE.exec(entry.name) : null;
      if (match?.[1] !== undefined) numbers.push(Number.parseInt(match[1], 10));
    }
  };
  if (ctx.fs.isDirectory(recordsDir)) walk(recordsDir);
  return numbers;
}

export function nextId(ctx: Context, recordsDir: string): string {
  const highest = listRecordNumbers(ctx, recordsDir).reduce((max, n) => Math.max(max, n), 0);
  return formatId(highest + 1);
}
