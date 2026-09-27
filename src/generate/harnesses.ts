import { join } from "node:path";
import type { Context } from "../core/context.ts";
import { type Adapter, agentSkillsAdapter, claudeCodeAdapter } from "./adapters.ts";

/** Where a harness gets the always-on rule (DL-045). */
export type RuleChannel = "claude-file" | "agents-file" | "block";

/** A skills directory in a project and the adapter that renders it. */
export interface SkillLayout {
  id: "claude" | "agents";
  adapter: Adapter;
  /** Relative to the project root. */
  dir: string;
}

export const CLAUDE_LAYOUT: SkillLayout = {
  id: "claude",
  adapter: claudeCodeAdapter,
  dir: ".claude/skills",
};
export const AGENTS_LAYOUT: SkillLayout = {
  id: "agents",
  adapter: agentSkillsAdapter,
  dir: ".agents/skills",
};
export const LAYOUTS: readonly SkillLayout[] = [CLAUDE_LAYOUT, AGENTS_LAYOUT];

export interface Harness {
  name: string;
  title: string;
  layout: SkillLayout;
  rule: RuleChannel;
  /** Paths at the project root whose presence suggests the harness is in use. */
  markers: readonly string[];
  // @decision(DL-049)
  /**
   * Instruction files at the project root it reads; it loads the first that exists, or every one
   * with `readsAll`. Claude Code differs: rule.ts models what it reads (DL-055).
   */
  instructions: readonly string[];
  // @decision(DL-061)
  /** Reads every file of `instructions` that exists, rather than the first. */
  readsAll?: boolean;
}

// @decision(DL-041)
export const HARNESSES: readonly Harness[] = [
  {
    name: "claude",
    title: "Claude Code",
    layout: CLAUDE_LAYOUT,
    rule: "claude-file",
    markers: [".claude", "CLAUDE.md"],
    // @decision(DL-054) @decision(DL-055)
    instructions: ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md", "AGENTS.md"],
  },
  {
    name: "antigravity",
    title: "Antigravity",
    layout: AGENTS_LAYOUT,
    rule: "agents-file",
    markers: [".agents/rules", ".agent", "GEMINI.md"],
    instructions: ["AGENTS.md"],
  },
  {
    name: "codex",
    title: "Codex",
    layout: AGENTS_LAYOUT,
    rule: "block",
    markers: [".codex"],
    instructions: ["AGENTS.md"],
  },
  {
    name: "cursor",
    title: "Cursor",
    layout: AGENTS_LAYOUT,
    rule: "block",
    markers: [".cursor"],
    // @decision(DL-061)
    instructions: ["AGENTS.md", "CLAUDE.md"],
    readsAll: true,
  },
  {
    name: "opencode",
    title: "OpenCode",
    layout: AGENTS_LAYOUT,
    rule: "block",
    markers: [".opencode", "opencode.json", "opencode.jsonc"],
    // @decision(DL-061) OpenCode 2.x; 1.x also fell back to CLAUDE.md.
    instructions: ["AGENTS.md"],
  },
  {
    name: "pi",
    title: "Pi",
    layout: AGENTS_LAYOUT,
    rule: "block",
    markers: [".pi"],
    instructions: ["AGENTS.md", "CLAUDE.md"],
  },
];

/** Markers of the AGENTS.md family that name no harness; they select `codex`. */
const GENERIC_MARKERS = ["AGENTS.md", ".agents/skills"];

export const HARNESS_NAMES = HARNESSES.map((harness) => harness.name);

export function findHarness(name: string): Harness | undefined {
  return HARNESSES.find((harness) => harness.name === name);
}

export interface Detection {
  harness: Harness;
  /** The marker that was found. */
  marker: string;
}

// @decision(DL-041)
/** The harnesses whose markers exist at `root`, in table order. */
export function detectHarnesses(ctx: Context, root: string): Detection[] {
  const found = (marker: string) => ctx.fs.lexists(join(root, marker));
  const detected: Detection[] = [];
  for (const harness of HARNESSES) {
    const marker = harness.markers.find(found);
    if (marker !== undefined) detected.push({ harness, marker });
  }
  const generic = GENERIC_MARKERS.find(found);
  const agentsLayoutFound = detected.some(({ harness }) => harness.layout === AGENTS_LAYOUT);
  const codex = findHarness("codex");
  if (generic !== undefined && !agentsLayoutFound && codex !== undefined) {
    detected.push({ harness: codex, marker: generic });
    detected.sort((a, b) => HARNESSES.indexOf(a.harness) - HARNESSES.indexOf(b.harness));
  }
  return detected;
}

/** The skill layouts and rule channels a set of harnesses needs. */
export interface Targets {
  layouts: Set<SkillLayout>;
  rules: Set<RuleChannel>;
}

export function targetsFor(harnesses: readonly Harness[]): Targets {
  return {
    layouts: new Set(harnesses.map((harness) => harness.layout)),
    rules: new Set(harnesses.map((harness) => harness.rule)),
  };
}
