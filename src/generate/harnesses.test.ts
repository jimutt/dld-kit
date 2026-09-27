import { describe, expect, test } from "bun:test";
import { fakeContext, memoryFs } from "../test-helpers.ts";
import {
  AGENTS_LAYOUT,
  CLAUDE_LAYOUT,
  detectHarnesses,
  findHarness,
  HARNESS_NAMES,
  targetsFor,
} from "./harnesses.ts";

const detect = (files: Record<string, string>) =>
  detectHarnesses(fakeContext({ fs: memoryFs(files) }), "/p").map(
    ({ harness, marker }) => `${harness.name}:${marker}`,
  );

describe("detectHarnesses", () => {
  test("finds each harness by its first marker, in table order", () => {
    expect(
      detect({
        "/p/opencode.json": "{}",
        "/p/CLAUDE.md": "",
        "/p/.pi/settings.json": "{}",
        "/p/.agent/rules/x.md": "",
      }),
    ).toEqual(["claude:CLAUDE.md", "antigravity:.agent", "opencode:opencode.json", "pi:.pi"]);
  });

  test("AGENTS.md or .agents/skills alone select codex", () => {
    expect(detect({ "/p/AGENTS.md": "" })).toEqual(["codex:AGENTS.md"]);
    expect(detect({ "/p/.claude/x": "", "/p/.agents/skills/s/SKILL.md": "" })).toEqual([
      "claude:.claude",
      "codex:.agents/skills",
    ]);
  });

  test("a more specific AGENTS.md reader wins over the generic markers", () => {
    expect(detect({ "/p/AGENTS.md": "", "/p/.cursor/rules/x.mdc": "" })).toEqual([
      "cursor:.cursor",
    ]);
  });

  test("finds nothing in an empty project", () => {
    expect(detect({})).toEqual([]);
  });
});

describe("the harness table", () => {
  test("names every harness, and maps each to a layout and a rule channel", () => {
    expect(HARNESS_NAMES).toEqual(["claude", "antigravity", "codex", "cursor", "opencode", "pi"]);
    expect(findHarness("claude")?.layout).toBe(CLAUDE_LAYOUT);
    expect(findHarness("pi")?.rule).toBe("block");
    expect(findHarness("gemini")).toBeUndefined();
  });

  test("targetsFor merges the layouts and channels of several harnesses", () => {
    const harnesses = ["claude", "antigravity", "pi", "codex"].map((name) => findHarness(name));
    const targets = targetsFor(harnesses.filter((h) => h !== undefined));
    expect([...targets.layouts]).toEqual([CLAUDE_LAYOUT, AGENTS_LAYOUT]);
    expect([...targets.rules]).toEqual(["claude-file", "agents-file", "block"]);
  });
});
