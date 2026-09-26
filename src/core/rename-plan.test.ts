import { describe, expect, test } from "bun:test";
import { parseRenamePlan, renameProblem } from "./rename-plan.ts";

const paths = {
  root: "/p",
  decisionsDir: "/p/decisions",
  recordsDir: "/p/decisions/records",
};

const plan = (...lines: string[]) => parseRenamePlan(paths, lines.join("\n"));

describe("parseRenamePlan", () => {
  test("parses entries, ignoring blank lines and CRLF", () => {
    expect(
      plan(
        "",
        "decisions/records/DL-002.md\tDL-002\tDL-007\r",
        "  ",
        "decisions/records/auth/DL-003.md\tDL-003\tDL-008",
        "",
      ),
    ).toEqual([
      { path: "decisions/records/DL-002.md", oldId: "DL-002", newId: "DL-007" },
      { path: "decisions/records/auth/DL-003.md", oldId: "DL-003", newId: "DL-008" },
    ]);
    expect(plan("\n\n")).toEqual([]);
  });

  test.each([
    ["decisions/records/DL-002.md\tDL-002", "line 1: expected <path>\\t<DL-OLD>\\t<DL-NEW>."],
    ["decisions/records/DL-002.md\tDL-002\tDL-7\tx", "line 1: expected"],
    ["decisions/records/DL-002.md\tDL-002\tnope", "line 1: IDs must match DL-[0-9]+."],
    ["decisions/records/DL-002.md\tDL-002\tDL-002", "old and new IDs are the same."],
    ["/etc/DL-002.md\tDL-002\tDL-007", "must be relative to the project root"],
    ["decisions/records/../../x/DL-002.md\tDL-002\tDL-007", "without '.' or '..'"],
    ["decisions/records//DL-002.md\tDL-002\tDL-007", "without '.' or '..'"],
    ["src/DL-002.md\tDL-002\tDL-007", "is not under decisions/records/."],
    ["decisions/records/DL-003.md\tDL-002\tDL-007", "is not named DL-002.md."],
  ])("rejects %j", (line, message) => {
    expect(() => plan(line)).toThrow(message);
  });

  test("rejects repeated paths, IDs and chains, naming the line", () => {
    const a = "decisions/records/DL-002.md\tDL-002\tDL-007";
    expect(() => plan(a, "", a)).toThrow("rename plan line 3: path");
    expect(() => plan(a, "decisions/records/x/DL-002.md\tDL-002\tDL-008")).toThrow(
      "line 2: DL-002 is renamed more than once.",
    );
    expect(() => plan(a, "decisions/records/DL-003.md\tDL-003\tDL-007")).toThrow(
      "line 2: DL-007 is the target of more than one rename.",
    );
    expect(() => plan("decisions/records/DL-003.md\tDL-003\tDL-002", a)).toThrow(
      "rename plan line 1: DL-002 is both renamed and a rename target.",
    );
  });
});

test("renameProblem accepts a valid rename", () => {
  expect(
    renameProblem(paths, { path: "decisions/records/DL-002.md", oldId: "DL-002", newId: "DL-9" }),
  ).toBeUndefined();
});
