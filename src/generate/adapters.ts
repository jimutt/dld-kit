import { BUNDLED_CLI, type ScriptRef, type SkillTemplate } from "./template.ts";

// @decision(DL-032)
export interface Adapter {
  id: string;
  /** Where this adapter's output is normally written, relative to the repository or project. */
  outputDir: string;
  /** Template fields copied into the frontmatter, in order, when the template sets them. */
  fields: readonly (keyof SkillTemplate["lines"])[];
  /** Frontmatter lines added after the copied fields. */
  extraFrontmatter: readonly string[];
  /** Frontmatter lines added to skills that run the CLI (`{{dld}}`). */
  dldFrontmatter: readonly string[];
  /** How `{{script <skill>/<path>}}` renders inside `fromSkill`'s SKILL.md. */
  scriptRef(fromSkill: string, ref: ScriptRef): string;
  /** How `{{dld}}` renders inside `fromSkill`'s SKILL.md. */
  dld(fromSkill: string): string;
  /** How `{{dld-setup}}` renders inside `fromSkill`'s SKILL.md. */
  dldSetup(fromSkill: string): string;
  /** Whether an `internal` skill gets a SKILL.md, or only its supporting files. */
  internalManifest: boolean;
}

const relativeRef = (fromSkill: string, { skill, path }: ScriptRef) =>
  skill === fromSkill ? path : `../${skill}/${path}`;

const SETUP =
  "The commands below run the `dld` CLI bundled with the dld-common skill, and need Node.js 20+.";

// @decision(DL-032) @decision(DL-036)
/** The portable Agent Skills layout, committed as `skills/`. */
export const agentSkillsAdapter: Adapter = {
  id: "agent-skills",
  outputDir: "skills",
  fields: ["name", "description", "compatibility"],
  extraFrontmatter: [],
  dldFrontmatter: [],
  scriptRef: relativeRef,
  dld: (fromSkill) => `node "<skill-dir>/${relativeRef(fromSkill, BUNDLED_CLI)}"`,
  dldSetup: (fromSkill) =>
    `${SETUP} \`<skill-dir>\` stands for the absolute path of this skill's directory. If \`<skill-dir>/${relativeRef(fromSkill, BUNDLED_CLI)}\` does not exist, stop and tell the user to install the dld-common skill: \`npx skills add jimutt/dld-kit --skill dld-common\`.`,
  internalManifest: true,
};

const CLAUDE_CLI = `\${CLAUDE_SKILL_DIR}/../${BUNDLED_CLI.skill}/${BUNDLED_CLI.path}`;

// @decision(DL-032) @decision(DL-036) @decision(DL-039)
/** Claude Code skills, written to `.claude/skills/` in a project. */
export const claudeCodeAdapter: Adapter = {
  id: "claude-code",
  outputDir: ".claude/skills",
  fields: ["name", "description"],
  extraFrontmatter: [],
  dldFrontmatter: [`allowed-tools: Bash(node "${CLAUDE_CLI}" *)`],
  scriptRef: (_fromSkill, { skill, path }) => `\${CLAUDE_SKILL_DIR}/../${skill}/${path}`,
  dld: () => `node "${CLAUDE_CLI}"`,
  dldSetup: () =>
    `${SETUP} If \`${CLAUDE_CLI}\` does not exist, stop and tell the user to reinstall dld-kit's skills, including dld-common.`,
  internalManifest: false,
};

export const ADAPTERS: readonly Adapter[] = [agentSkillsAdapter, claudeCodeAdapter];
