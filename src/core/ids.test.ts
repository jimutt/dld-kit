import { describe, expect, test } from "bun:test";
import { fakeContext, memoryFs } from "../test-helpers.ts";
import { formatId, isCanonicalId, nextId } from "./ids.ts";

const RECORDS = "/p/decisions/records";

function next(files: string[]): string {
  const fs = memoryFs(Object.fromEntries(files.map((f) => [`${RECORDS}/${f}`, ""])));
  return nextId(fakeContext({ fs }), RECORDS);
}

describe("formatId", () => {
  test("pads to three digits and grows beyond them", () => {
    expect(formatId(1)).toBe("DL-001");
    expect(formatId(42)).toBe("DL-042");
    expect(formatId(1000)).toBe("DL-1000");
  });
});

// @decision(DL-078)
describe("isCanonicalId", () => {
  test("accepts exactly the formatId spelling", () => {
    for (const id of ["DL-001", "DL-042", "DL-999", "DL-1000", "DL-12345"]) {
      expect(isCanonicalId(id)).toBe(true);
    }
    for (const id of [
      "DL-1",
      "DL-01",
      "DL-0042",
      "DL-01000",
      "dl-001",
      "DL-",
      "DL-1a",
      "XDL-001",
    ]) {
      expect(isCanonicalId(id)).toBe(false);
    }
  });
});

describe("nextId", () => {
  test("starts at DL-001 when the records directory is missing", () => {
    expect(nextId(fakeContext(), RECORDS)).toBe("DL-001");
  });

  test("starts at DL-001 when there are no records", () => {
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

  test("ignores files that are not decision records", () => {
    expect(next(["DL-002.md", "notes.txt", "DL-draft.md", "DL-007.md.bak"])).toBe("DL-003");
  });
});
