import { describe, expect, test } from "bun:test";
import {
  canonicalSpelling,
  compareIds,
  findIds,
  formatId,
  identityKey,
  idMatcher,
  isCanonicalId,
  isDecisionId,
  looksLikeId,
  parseId,
  recordFileId,
  reservedFileId,
} from "./ids.ts";

const T1 = "DL-T1k3m9z2p7xq4";
const T2 = "DL-T1k3m9z2p7xq5";

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

  // @decision(DL-092)
  test("accepts a timestamp ID only in lower-case Crockford base32 of the exact length", () => {
    expect(isCanonicalId(T1)).toBe(true);
    for (const id of [
      "DL-T1K3M9Z2P7XQ4",
      "DL-t1k3m9z2p7xq4",
      "DL-T1k3m9z2p7xq",
      "DL-T1k3m9z2p7xq4h",
      "DL-T1k3m9z2p7xqi",
      "DL-T1k3m9z2p7xql",
      "DL-T1k3m9z2p7xqo",
      "DL-T1k3m9z2p7xqu",
      "DL-1k3m9z2p7xq4",
    ]) {
      expect(isCanonicalId(id)).toBe(false);
    }
  });
});

describe("canonicalSpelling", () => {
  test("respells DL- IDs in any case and padding, and gives up on others", () => {
    expect(canonicalSpelling("DL-5")).toBe("DL-005");
    expect(canonicalSpelling("dl-0042")).toBe("DL-042");
    expect(canonicalSpelling("DL-01000")).toBe("DL-1000");
    expect(canonicalSpelling("DL-99999999999999999999")).toBeUndefined();
    expect(canonicalSpelling("../x")).toBeUndefined();
  });

  // @decision(DL-092)
  test("respells a timestamp ID written in upper case or with look-alike letters", () => {
    expect(canonicalSpelling("DL-T1K3M9Z2P7XQ4")).toBe(T1);
    expect(canonicalSpelling("dl-t1k3m9z2p7xq4")).toBe(T1);
    expect(canonicalSpelling("DL-TIk3m9z2p7xOL")).toBe("DL-T1k3m9z2p7x01");
    expect(canonicalSpelling("DL-T1k3m9z2p7xqu")).toBeUndefined();
    expect(canonicalSpelling("DL-T1k3m9")).toBeUndefined();
    expect(canonicalSpelling("DL-Tbd")).toBeUndefined();
  });
});

// @decision(DL-092) @decision(DL-093)
describe("parseId", () => {
  test("tells the two forms apart and rejects everything else", () => {
    expect(parseId("DL-008")).toEqual({ form: "sequential", number: 8 });
    expect(parseId("DL-5")).toEqual({ form: "sequential", number: 5 });
    expect(parseId(T1)).toEqual({ form: "timestamp", key: "1k3m9z2p7xq4" });
    for (const id of ["DL-", "dl-001", "DL-T1K3M9Z2P7XQ4", "DL-001x", "x", `${T1}0`]) {
      expect(parseId(id)).toBeUndefined();
      expect(isDecisionId(id)).toBe(false);
    }
    expect(isDecisionId("DL-5")).toBe(true);
    expect(isDecisionId(T1)).toBe(true);
  });
});

// @decision(DL-093)
describe("compareIds", () => {
  test("orders sequential IDs by number, then timestamp IDs by text, then the rest", () => {
    const ids = [T2, "zzz", "DL-1000", T1, "DL-999", "DL-01", "DL-001", "abc", "DL-002"];
    expect([...ids].sort(compareIds)).toEqual([
      "DL-001",
      "DL-01",
      "DL-002",
      "DL-999",
      "DL-1000",
      T1,
      T2,
      "abc",
      "zzz",
    ]);
    expect(compareIds(T1, T1)).toBe(0);
  });
});

// @decision(DL-094)
describe("finding IDs in text", () => {
  test("finds both forms, and a sequential ID ends where its digits end", () => {
    expect(findIds(`see DL-001, DL-1000x and ${T1}. Also (${T2})`)).toEqual([
      "DL-001",
      "DL-1000",
      T1,
      T2,
    ]);
    expect(findIds("nothing here: DL-, DL-Tbd, dl-001")).toEqual([]);
  });

  test("a timestamp ID is not found inside a longer lower-case run", () => {
    expect(findIds(`${T1}0 ${T1}x`)).toEqual([]);
    expect(findIds(`${T1}X ${T1}-x ${T1}'s`)).toEqual([T1, T1, T1]);
  });

  test("idMatcher matches a whole ID only", () => {
    expect("DL-1000 DL-100".replace(idMatcher("DL-100", "g"), "X")).toBe("DL-1000 X");
    expect(`${T1}0 ${T1}`.replace(idMatcher(T1, "g"), "X")).toBe(`${T1}0 X`);
    expect(idMatcher("DL-100").test("DL-100a")).toBe(true);
  });

  test("looksLikeId spots a mistyped ID of either form", () => {
    for (const text of ["( DL-002 )", "(dl-003)", "(DL-T1K3M9Z2P7XQ4)", "(dl-t1k3)"]) {
      expect(looksLikeId(text)).toBe(true);
    }
    for (const text of ["(DL-XXX)", "(DL-NNN)", "(DL-TBD)", "(DL-Table)"]) {
      expect(looksLikeId(text)).toBe(false);
    }
  });
});

// @decision(DL-096)
test("identityKey is the number for a sequential ID and the text for a timestamp ID", () => {
  expect(identityKey("DL-07")).toBe(identityKey("DL-007"));
  expect(identityKey("DL-007")).not.toBe(identityKey("DL-008"));
  expect(identityKey(T1)).toBe(T1);
  expect(identityKey(T1)).not.toBe(identityKey(T2));
});

// @decision(DL-099)
describe("record file names", () => {
  test("a record file is exactly <id>.md", () => {
    expect(recordFileId("DL-008.md")).toBe("DL-008");
    expect(recordFileId(`${T1}.md`)).toBe(T1);
    for (const name of ["DL-008.md.bak", "DL-draft.md", `${T1}--slug.md`, "DL-008--x.md", "x.md"]) {
      expect(recordFileId(name)).toBeUndefined();
    }
  });

  test("<id>--<text>.md is reserved", () => {
    expect(reservedFileId(`${T1}--retry-policy.md`)).toBe(T1);
    expect(reservedFileId("DL-008--x.md")).toBe("DL-008");
    expect(reservedFileId("DL-008.md")).toBeUndefined();
    expect(reservedFileId("DL-008-x.md")).toBeUndefined();
  });
});
