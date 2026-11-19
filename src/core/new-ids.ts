import type { IdFormat } from "./config.ts";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";
import { formatId, parseId, RANDOM_CHARS, timestampId, timestampSeconds } from "./ids.ts";
import type { Project } from "./project.ts";
import { listRecordFiles, recordId } from "./records.ts";

/** How far ahead of the clock a timestamp ID may be and still order the IDs created after it. */
export const BURST_WINDOW_SECONDS = 60;
const RANDOM_VALUES = 32 ** RANDOM_CHARS;
const MINT_ATTEMPTS = 16;

const clockSeconds = (ctx: Context) => Math.floor(ctx.now().getTime() / 1000);

// @decision(DL-095)
/** The timestamp IDs among `ids` dated more than the burst window ahead of the clock. */
export function idsAheadOfClock(ctx: Context, ids: Iterable<string>): string[] {
  const limit = clockSeconds(ctx) + BURST_WINDOW_SECONDS;
  return [...ids].filter((id) => (timestampSeconds(id) ?? 0) > limit);
}

// @decision(DL-095)
/**
 * A new timestamp ID that is not in `existing`. Its time is the clock's, or one second after
 * the newest existing timestamp ID when that one is at or ahead of the clock, so IDs created
 * in quick succession keep their order. It is never more than the burst window ahead of the
 * clock, and IDs further ahead than that are ignored.
 */
export function mintTimestampId(ctx: Context, existing: ReadonlySet<string>): string {
  const now = clockSeconds(ctx);
  let newest: number | undefined;
  for (const id of existing) {
    const seconds = timestampSeconds(id);
    if (seconds === undefined || seconds > now + BURST_WINDOW_SECONDS) continue;
    if (newest === undefined || seconds > newest) newest = seconds;
  }
  const seconds =
    newest !== undefined && newest >= now ? Math.min(newest + 1, now + BURST_WINDOW_SECONDS) : now;
  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt++) {
    const bytes = ctx.randomBytes(4);
    if (bytes.length < 4) throw new Error("randomBytes returned too few bytes");
    const random = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0) % RANDOM_VALUES;
    const id = timestampId(seconds, random);
    if (!existing.has(id)) return id;
  }
  throw new DldError("could not generate a decision ID that is not taken; try again.");
}

// @decision(DL-078) @decision(DL-095)
/** One more than the highest sequential number among `ids`; timestamp IDs do not count. */
export function nextSequentialId(ids: Iterable<string>): string {
  let highest = 0;
  for (const id of ids) {
    const parsed = parseId(id);
    if (parsed?.form === "sequential") highest = Math.max(highest, parsed.number);
  }
  return formatId(highest + 1);
}

// @decision(DL-095) @decision(DL-096)
/**
 * `count` new IDs in `format`, in order, none of them in `existing` or repeated. A timestamp
 * ID dated too far ahead of the clock is reported through `ctx.warn` and ignored.
 */
export function mintIds(
  ctx: Context,
  format: IdFormat,
  existing: Iterable<string>,
  count: number,
): string[] {
  const known = new Set(existing);
  if (format === "timestamp") {
    for (const id of idsAheadOfClock(ctx, known)) ctx.warn(aheadOfClockMessage(id));
  }
  const minted: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = format === "timestamp" ? mintTimestampId(ctx, known) : nextSequentialId(known);
    known.add(id);
    minted.push(id);
  }
  return minted;
}

// @decision(DL-095)
export function aheadOfClockMessage(id: string): string {
  return `${id} is dated more than ${BURST_WINDOW_SECONDS} seconds ahead of the clock; it is ignored when ordering new IDs`;
}

// @decision(DL-078) @decision(DL-095)
/** The next decision ID in the project's configured form. */
export function nextId(ctx: Context, { config, paths }: Project): string {
  const ids = listRecordFiles(ctx, paths.recordsDir).map(recordId);
  const [id] = mintIds(ctx, config.idFormat, ids, 1);
  if (id === undefined) throw new Error("mintIds returned nothing");
  return id;
}
