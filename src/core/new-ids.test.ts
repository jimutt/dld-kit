import { describe, expect, test } from "bun:test";
import { FIXED_NOW, fakeContext, memoryFs } from "../test-helpers.ts";
import { parseConfig } from "./config.ts";
import type { Context } from "./context.ts";
import { timestampId } from "./ids.ts";
import {
  aheadOfClockMessage,
  idsAheadOfClock,
  mintIds,
  mintTimestampId,
  nextId,
  nextSequentialId,
} from "./new-ids.ts";
import { type Project, resolvePaths } from "./project.ts";

const NOW = Math.floor(FIXED_NOW.getTime() / 1000);
const at = (offset: number, random = 0) => timestampId(NOW + offset, random);

function projectWith(files: string[], idFormat = "sequential"): { ctx: Context; project: Project } {
  const config = parseConfig(`decisions_dir: decisions\nmode: flat\nid_format: ${idFormat}\n`);
  const paths = resolvePaths("/p", config);
  const fs = memoryFs(Object.fromEntries(files.map((f) => [`${paths.recordsDir}/${f}`, ""])));
  return { ctx: fakeContext({ fs }), project: { config, paths } };
}

function next(files: string[], idFormat?: string): string {
  const { ctx, project } = projectWith(files, idFormat);
  return nextId(ctx, project);
}

/** A context whose random bytes come from `values`, one 4-byte big-endian number per call. */
function withRandom(...values: number[]): Context {
  let call = 0;
  return fakeContext({
    randomBytes: () => {
      const value = values[Math.min(call++, values.length - 1)] ?? 0;
      return Uint8Array.of(value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
    },
  });
}

// @decision(DL-078) @decision(DL-095)
describe("nextId, sequential", () => {
  test("starts at DL-001 when the records directory is missing or has no records", () => {
    const { project } = projectWith([]);
    expect(nextId(fakeContext(), project)).toBe("DL-001");
    expect(next(["README.md"])).toBe("DL-001");
  });

  test("follows the highest ID, including across gaps", () => {
    expect(next(["DL-001.md", "DL-005.md"])).toBe("DL-006");
  });

  test("parses zero-padded numbers as decimal", () => {
    expect(next(["DL-008.md", "DL-009.md"])).toBe("DL-010");
  });

  test("scans namespace subdirectories", () => {
    expect(next(["billing/DL-001.md", "auth/DL-003.md"])).toBe("DL-004");
  });

  test("ignores timestamp IDs and files that are not decision records", () => {
    expect(next(["DL-002.md", `${at(0)}.md`])).toBe("DL-003");
    expect(next([`${at(0)}.md`])).toBe("DL-001");
    expect(next(["DL-002.md", "notes.txt", "DL-draft.md", "DL-007.md.bak"])).toBe("DL-003");
    expect(nextSequentialId(["x", "DL-9", "DL-010"])).toBe("DL-011");
  });
});

// @decision(DL-095)
describe("nextId, timestamp", () => {
  test("uses the clock's second and 25 random bits", () => {
    expect(next(["DL-002.md"], "timestamp")).toBe(at(0));
    expect(mintTimestampId(withRandom(0xffffffff), new Set())).toBe(at(0, 32 ** 5 - 1));
    expect(mintTimestampId(withRandom(0x02000001), new Set())).toBe(at(0, 1));
    expect(at(0, 32 ** 5 - 1)).toEndWith("zzzzz");
  });

  test("goes one second past the newest local ID at or just ahead of the clock", () => {
    expect(next([`${at(-5, 9)}.md`], "timestamp")).toBe(at(0));
    expect(next([`${at(0, 9)}.md`], "timestamp")).toBe(at(1));
    expect(next([`${at(0, 9)}.md`, `${at(7, 9)}.md`, `${at(3, 9)}.md`], "timestamp")).toBe(at(8));
    expect(next([`${at(59, 9)}.md`], "timestamp")).toBe(at(60));
    expect(next([`${at(60, 9)}.md`], "timestamp")).toBe(at(60));
  });

  test("ignores, and warns about, an ID dated more than 60 seconds ahead", () => {
    const { ctx, project } = projectWith([`${at(61, 9)}.md`, `${at(2, 9)}.md`], "timestamp");
    const warnings: string[] = [];
    const warning = { ...ctx, warn: (message: string) => warnings.push(message) };
    expect(nextId(warning, project)).toBe(at(3));
    expect(warnings).toEqual([aheadOfClockMessage(at(61, 9))]);
    expect(idsAheadOfClock(ctx, [at(60), at(61), "DL-999", "x"])).toEqual([at(61)]);
  });

  test("draws again when the ID is taken, and gives up after repeated clashes", () => {
    // Only at the end of the burst window can a new ID share its second with an existing one.
    const taken = new Set([at(60, 4)]);
    expect(mintTimestampId(withRandom(4, 4, 6), taken)).toBe(at(60, 6));
    expect(() => mintTimestampId(withRandom(4), taken)).toThrow(
      "could not generate a decision ID that is not taken",
    );
  });
});

// @decision(DL-095) @decision(DL-096)
describe("mintIds", () => {
  test("stays unique past the burst window, where IDs share the last second", () => {
    let counter = 0;
    const ctx = fakeContext({
      randomBytes: () => {
        counter += 1;
        return Uint8Array.of(0, 0, counter >>> 8, counter & 255);
      },
    });
    const ids = mintIds(ctx, "timestamp", [], 70);
    expect(new Set(ids).size).toBe(70);
    expect(ids.slice(0, 61)).toEqual([...ids.slice(0, 61)].sort());
    expect(ids.slice(60).every((id) => id.startsWith(at(60).slice(0, 11)))).toBe(true);
  });

  test("fails on a random source that returns too few bytes", () => {
    const ctx = fakeContext({ randomBytes: () => new Uint8Array(2) });
    expect(() => mintIds(ctx, "timestamp", [], 1)).toThrow("too few bytes");
  });

  test("gives consecutive sequential numbers above the highest", () => {
    expect(mintIds(fakeContext(), "sequential", ["DL-007", at(0)], 3)).toEqual([
      "DL-008",
      "DL-009",
      "DL-010",
    ]);
    expect(mintIds(fakeContext(), "sequential", [], 0)).toEqual([]);
  });

  test("gives timestamp IDs one second apart, in order", () => {
    expect(mintIds(fakeContext(), "timestamp", ["DL-007"], 3)).toEqual([at(0), at(1), at(2)]);
    expect(mintIds(fakeContext(), "timestamp", [at(5, 1)], 2)).toEqual([at(6), at(7)]);
  });
});
