import { describe, expect, test } from "bun:test";
import { mentionTiers, statedRelations } from "./mentions.ts";

const stated = (body: string) => statedRelations(body).map((s) => `${s.relation} ${s.id}`);
const tiers = (body: string) => Object.fromEntries(mentionTiers(body));

describe("statedRelations", () => {
  test.each([
    ["Amends DL-033: emptied directories are now removed.", ["amends DL-033"]],
    [
      "Amends DL-036 (the claude-code setup text) and DL-031 (template validation).",
      ["amends DL-036", "amends DL-031"],
    ],
    ["It amends DL-043's symlink rule.", ["amends DL-043"]],
    ["This SUPERSEDES DL-013.", ["supersedes DL-013"]],
    ["This decision supersedes DL-004 and amends DL-007.", ["supersedes DL-004", "amends DL-007"]],
    ["Amends DL-045 (see DL-012, and (nested DL-011) too).", ["amends DL-045"]],
    ["DL-043 amends DL-033, which this builds on.", []],
    ["The approach DL-012 amends is kept.", []],
    ["This amended DL-005 and supersedes nothing.", []],
    ["The `amends` list names DL-005.", []],
    ['A body that says "Amends DL-031" with no flag.', []],
    ["Such as a negated one (\u201cthis never supersedes DL-005\u201d).", []],
  ])("%s", (body, expected) => {
    expect(stated(body)).toEqual(expected);
  });

  test("splits sentences at punctuation and line breaks, and repeats nothing", () => {
    expect(
      stated("See DL-001. Amends DL-002; DL-003 amends DL-004\nAmends DL-002 and DL-005"),
    ).toEqual(["amends DL-002", "amends DL-005"]);
  });

  test("skips fenced code blocks", () => {
    const body =
      "```\nAmends DL-001.\n~~~\nstill code\n```\nAmends DL-002.\n~~~~\nAmends DL-003.\n~~~~\n";
    expect(stated(body)).toEqual(["amends DL-002"]);
  });
});

describe("mentionTiers", () => {
  test("cue words count only in Decision and Consequences, per sentence", () => {
    const body = [
      "## Context",
      "",
      "DL-001 replaced the old approach.",
      "",
      "## Decision",
      "",
      "- This no longer follows DL-002. It writes files with DL-003.",
      "- Uses DL-004 instead of DL-005.",
      "",
      "### Detail",
      "",
      "Extends DL-006.",
      "",
      "## Consequences ##",
      "",
      "Amends DL-007. Narrows `DL-008`'s scope.",
      "",
      "## Rationale",
      "",
      "Overrides DL-009.",
    ].join("\n");
    expect(tiers(body)).toEqual({
      "DL-001": "mention",
      "DL-002": "cue",
      "DL-003": "mention",
      "DL-004": "cue",
      "DL-005": "cue",
      "DL-006": "cue",
      "DL-007": "explicit",
      "DL-008": "mention",
      "DL-009": "mention",
    });
  });

  test("an explicit sentence anywhere outranks the other tiers", () => {
    expect(tiers("Amends DL-001.\n\n## Decision\n\nReplaces DL-001 and DL-002.\n")).toEqual({
      "DL-001": "explicit",
      "DL-002": "cue",
    });
  });
});
