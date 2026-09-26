import { describe, expect, test } from "bun:test";
import { fakeContext, memoryFs, recordText } from "../test-helpers.ts";
import {
  findRecordFile,
  formatTimestamp,
  listRecordFiles,
  parseRecord,
  recordNumber,
  renderNewRecord,
  setStatus,
} from "./records.ts";

function parseError(text: string): string {
  try {
    parseRecord(text, "DL-001.md");
  } catch (error) {
    if (error instanceof Error) return error.message;
  }
  throw new Error("expected parseRecord to throw");
}

describe("parseRecord", () => {
  test("reads the fields and applies defaults", () => {
    expect(parseRecord(recordText("DL-001", "accepted", "namespace: billing\n"), "f")).toEqual({
      id: "DL-001",
      title: "Test decision DL-001",
      status: "accepted",
      timestamp: "2026-01-15T10:00:00Z",
      supersedes: [],
      amends: [],
      namespace: "billing",
      tags: ["test", "example"],
      references: [],
    });
    expect(parseRecord("---\nid: DL-2\ntitle: T\nstatus: proposed\n---\n", "f")).toEqual({
      id: "DL-2",
      title: "T",
      status: "proposed",
      supersedes: [],
      amends: [],
      tags: [],
      references: [],
    });
  });

  test("reads references and block-style lists", () => {
    const record = parseRecord(
      "---\nid: DL-1\ntitle: T\nstatus: accepted\ntags:\n  - a\n  - 2\nreferences:\n  - path: src/a.ts\n    symbol: f\n  - path: src/b.ts\n---\n",
      "f",
    );
    expect(record.tags).toEqual(["a", "2"]);
    expect(record.references).toEqual([{ path: "src/a.ts", symbol: "f" }, { path: "src/b.ts" }]);
  });

  test.each([
    ["no frontmatter", "# just text\n", "no frontmatter"],
    ["unclosed frontmatter", "---\nid: DL-1\n", "no frontmatter"],
    ["invalid YAML", "---\nid: [\n---\n", "not valid YAML"],
    ["not a mapping", "---\n- a\n---\n", "must be a mapping"],
    ["missing id", "---\ntitle: T\nstatus: accepted\n---\n", "'id' is required"],
    [
      "non-string title",
      "---\nid: DL-1\ntitle: 5\nstatus: accepted\n---\n",
      "'title' must be a string",
    ],
    ["unknown status", "---\nid: DL-1\ntitle: T\nstatus: done\n---\n", "'status' must be one of"],
    [
      "scalar tags",
      "---\nid: DL-1\ntitle: T\nstatus: accepted\ntags: a\n---\n",
      "'tags' must be a list",
    ],
    [
      "nested tags",
      "---\nid: DL-1\ntitle: T\nstatus: accepted\ntags: [[a]]\n---\n",
      "list of strings",
    ],
    [
      "scalar references",
      "---\nid: DL-1\ntitle: T\nstatus: accepted\nreferences: x\n---\n",
      "'references' must be a list",
    ],
    [
      "reference without path",
      "---\nid: DL-1\ntitle: T\nstatus: accepted\nreferences: [{symbol: f}]\n---\n",
      "must have a 'path'",
    ],
  ])("rejects %s, naming the file", (_name, text, message) => {
    const error = parseError(text);
    expect(error).toStartWith("DL-001.md: ");
    expect(error).toContain(message);
  });
});

describe("setStatus", () => {
  test("changes only the status line inside the frontmatter", () => {
    const text = `${recordText("DL-001", "proposed")}\nstatus: proposed in the body\n---\nstatus: x\n`;
    const updated = setStatus(text, "accepted", "f");
    expect(updated).toBe(text.replace("status: proposed\n", "status: accepted\n"));
  });

  test("keeps comments and formatting elsewhere in the frontmatter", () => {
    const text = "---\nid: DL-1   # keep\ntitle: 'T'\nstatus: proposed\n---\nbody";
    expect(setStatus(text, "deprecated", "f")).toBe(
      "---\nid: DL-1   # keep\ntitle: 'T'\nstatus: deprecated\n---\nbody",
    );
  });

  test("fails without frontmatter or a status line", () => {
    expect(() => setStatus("body", "accepted", "f")).toThrow("no frontmatter");
    expect(() => setStatus("---\nid: DL-1\n---\n", "accepted", "f")).toThrow("no 'status' field");
  });
});

describe("renderNewRecord", () => {
  const base = {
    id: "DL-003",
    title: "Use X",
    timestamp: "2026-01-15T10:00:00Z",
    tags: "a,b",
    supersedes: "",
    amends: "DL-001",
    body: "",
  };

  test("matches the create-decision.sh layout", () => {
    expect(renderNewRecord({ ...base, body: "## Context\n\nText\n\n\n" })).toBe(`---
id: DL-003
title: "Use X"
timestamp: 2026-01-15T10:00:00Z
status: proposed
supersedes: []
amends: [DL-001]
tags: [a,b]
references: []
---

## Context

Text
`);
  });

  test("ends after the blank line when there is no body, and writes the namespace", () => {
    const text = renderNewRecord({ ...base, namespace: "billing" });
    expect(text).toEndWith("references: []\n---\n\n");
    expect(text).toContain("amends: [DL-001]\nnamespace: billing\ntags: [a,b]\n");
  });

  test("escapes quotes and backslashes in the title so the YAML stays valid", () => {
    const text = renderNewRecord({ ...base, title: 'Say "hi" \\ bye' });
    expect(text).toContain('title: "Say \\"hi\\" \\\\ bye"');
    expect(parseRecord(text, "f").title).toBe('Say "hi" \\ bye');
  });
});

describe("record files", () => {
  const ctx = fakeContext({
    fs: memoryFs({
      "/r/DL-010.md": "",
      "/r/billing/DL-002.md": "",
      "/r/notes.md": "",
      "/r/DL-x.md": "",
    }),
  });

  test("lists DL-NNN.md files at any depth", () => {
    expect(listRecordFiles(ctx, "/r").sort()).toEqual(["/r/DL-010.md", "/r/billing/DL-002.md"]);
    expect(listRecordFiles(ctx, "/missing")).toEqual([]);
  });

  test("finds a record by ID in a subdirectory", () => {
    expect(findRecordFile(ctx, "/r", "DL-002")).toBe("/r/billing/DL-002.md");
    expect(findRecordFile(ctx, "/r", "DL-003")).toBeUndefined();
  });

  test("reads the number from a record path", () => {
    expect(recordNumber("/r/DL-010.md")).toBe(10);
    expect(() => recordNumber("/r/notes.md")).toThrow("not a decision record file");
  });
});

test("formatTimestamp drops milliseconds and uses UTC", () => {
  expect(formatTimestamp(new Date("2026-03-04T05:06:07.890Z"))).toBe("2026-03-04T05:06:07Z");
});
