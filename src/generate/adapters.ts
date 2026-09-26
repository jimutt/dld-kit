import type { ScriptRef, SkillTemplate } from "./template.ts";

// @decision(DL-032)
export interface Adapter {
  id: string;
  /** Where this adapter's output is normally written, relative to the repository or project. */
  outputDir: string;
  /** Template fields copied into the frontmatter, in order, when the template sets them. */
  fields: readonly (keyof SkillTemplate["lines"])[];
  /** Frontmatter lines added after the copied fields. */
  extraFrontmatter: readonly string[];
  /** How `{{script <skill>/<path>}}` renders inside `fromSkill`'s SKILL.md. */
  scriptRef(fromSkill: string, ref: ScriptRef): string;
  /** Whether an `internal` skill gets a SKILL.md, or only its supporting files. */
  internalManifest: boolean;
}

// @decision(DL-032)
/** The portable Agent Skills layout, committed as `skills/`. */
export const agentSkillsAdapter: Adapter = {
  id: "agent-skills",
  outputDir: "skills",
  fields: ["name", "description", "compatibility"],
  extraFrontmatter: [],
  scriptRef: (fromSkill, { skill, path }) => (skill === fromSkill ? path : `../${skill}/${path}`),
  internalManifest: true,
};

// @decision(DL-032)
/** Claude Code project skills in `.claude/skills/`. */
export const claudeCodeAdapter: Adapter = {
  id: "claude-code",
  outputDir: ".claude/skills",
  fields: ["name", "description"],
  extraFrontmatter: ["user_invocable: true"],
  scriptRef: (_fromSkill, { skill, path }) => `.claude/skills/${skill}/${path}`,
  internalManifest: false,
};

export const ADAPTERS: readonly Adapter[] = [agentSkillsAdapter, claudeCodeAdapter];
