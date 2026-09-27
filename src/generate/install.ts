import { dirname, join } from "node:path";
import type { Context } from "../core/context.ts";
import { DldError } from "../core/errors.ts";
import { type GeneratedFiles, generateSkills, writeOutput } from "./generate.ts";
import {
  AGENTS_LAYOUT,
  CLAUDE_LAYOUT,
  type Harness,
  LAYOUTS,
  type RuleChannel,
  type SkillLayout,
  type Targets,
} from "./harnesses.ts";
import {
  applyRulePlan,
  installedRuleChannels,
  installedRuleStamps,
  planRule,
  type RulePlan,
  refuseSymlinkedDir,
} from "./rule.ts";
import { BUNDLED_CLI } from "./template.ts";

/** What `dld init` and `dld update` render skills from: the npm package the CLI runs from. */
export interface InstallSource {
  templatesDir: string;
  /** The running CLI file's content, installed as dld-common/scripts/dld.mjs. */
  cli: string;
}

// @decision(DL-042)
/**
 * The templates shipped beside the running CLI (`<package>/dist/dld.mjs` next to
 * `<package>/templates/`). The copy bundled into dld-common has none, and cannot install skills.
 */
export function packageSource(ctx: Context, cliPath: string, command: string): InstallSource {
  const templatesDir = join(dirname(cliPath), "..", "templates", "skills");
  if (!ctx.fs.isDirectory(templatesDir)) {
    throw new DldError(
      `dld ${command} installs skills from the dld-kit npm package, but this copy of dld (${cliPath}) has no templates beside it. Run it from the package instead: npx dld-kit@latest ${command}`,
    );
  }
  return { templatesDir, cli: ctx.fs.readFile(cliPath) };
}

/** Owned skill directories are `dld-*` (DL-033). */
const isOwned = (name: string) => name.startsWith("dld-");

/** The `dld-*` skills in a layout's directory: directories, and symlinks to them (DL-051). */
function ownedSkills(ctx: Context, root: string, layout: SkillLayout): string[] {
  const dir = join(root, layout.dir);
  if (!ctx.fs.isDirectory(dir)) return [];
  return ctx.fs
    .readDir(dir)
    .filter((entry) => !entry.isFile && isOwned(entry.name))
    .map((entry) => entry.name)
    .sort();
}

// @decision(DL-051)
/** Fails when a `dld-*` entry in the layout's directory is a symlink: another installer manages it. */
function refuseSymlinkedSkills(ctx: Context, root: string, layout: SkillLayout): void {
  const dir = join(root, layout.dir);
  if (!ctx.fs.isDirectory(dir)) return;
  const linked = ctx.fs
    .readDir(dir)
    .filter((entry) => isOwned(entry.name) && !entry.isDirectory && !entry.isFile)
    .map((entry) => `${layout.dir}/${entry.name}`)
    .sort();
  if (linked.length === 0) return;
  throw new DldError(
    `${linked.join(", ")} ${linked.length === 1 ? "is a symlink" : "are symlinks"}, so another installer, such as npx skills, manages these skills. Update them with npx skills update, or remove them and run this command again. To set up DLD without touching them, run the dld-init skill or dld install-rule.`,
  );
}

const SKILLS_LOCK = "skills-lock.json";

// @decision(DL-051)
/** A warning when npx skills' lock file lists `dld-*` skills: both tools would update them. */
export function skillsLockWarning(ctx: Context, root: string): string[] {
  const path = join(root, SKILLS_LOCK);
  if (!ctx.fs.isRegularFile(path)) return [];
  let skills: unknown;
  try {
    skills = JSON.parse(ctx.fs.readFile(path))?.skills;
  } catch {
    return [];
  }
  if (typeof skills !== "object" || skills === null) return [];
  const listed = Object.keys(skills).filter(isOwned).sort();
  if (listed.length === 0) return [];
  return [
    `${SKILLS_LOCK} lists ${listed.join(", ")}: npx skills manages those skills, so dld update and npx skills update overwrite each other's copies. Update them with one of the two.`,
  ];
}

/** The skill layouts that already hold `dld-*` skills under `root`. */
export function installedLayouts(ctx: Context, root: string): SkillLayout[] {
  return LAYOUTS.filter((layout) => ownedSkills(ctx, root, layout).length > 0);
}

// @decision(DL-043) @decision(DL-045)
/**
 * The layouts and rule channels installed under `root`. Claude Code skills imply Claude Code's
 * rule, so a project whose rule was never installed or was dropped (pre-1.0 copies, a CLAUDE.md
 * created after the block went into AGENTS.md) gets it back; `planRule` still skips it when
 * Claude Code already loads the block.
 */
export function installedTargets(ctx: Context, root: string): Targets {
  const layouts = new Set(installedLayouts(ctx, root));
  const rules = installedRuleChannels(ctx, root);
  if (layouts.has(CLAUDE_LAYOUT)) rules.add("claude-file");
  return { layouts, rules };
}

/** A warning when `.agents/skills` holds DLD skills but no harness reading it has the rule. */
export function missingAgentsRuleWarning({ layouts, rules }: Targets): string[] {
  if (!layouts.has(AGENTS_LAYOUT) || rules.has("block") || rules.has("agents-file")) return [];
  return [
    `${AGENTS_LAYOUT.dir} has the DLD skills, but no agent reading it has the always-on rule. Run dld install-rule --agent <name> (antigravity, codex, cursor, opencode or pi).`,
  ];
}

const SKILL_STAMP = /^ {2}dld-kit-version: "?([^"\n]+)"?$/m;

export interface Stamp {
  /** Relative to the project root. */
  path: string;
  /** Undefined for a file without a readable stamp, such as a pre-1.0 copy. */
  version: string | undefined;
}

/** The version stamps of every installed skill and rule channel under `root`. */
export function installedStamps(ctx: Context, root: string): Stamp[] {
  const stamps: Stamp[] = [];
  for (const layout of LAYOUTS) {
    for (const skill of ownedSkills(ctx, root, layout)) {
      const path = `${layout.dir}/${skill}/SKILL.md`;
      if (!ctx.fs.isRegularFile(join(root, path))) continue;
      stamps.push({ path, version: SKILL_STAMP.exec(ctx.fs.readFile(join(root, path)))?.[1] });
    }
  }
  return [...stamps, ...installedRuleStamps(ctx, root)];
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Compares two semver versions; undefined if either does not parse. */
export function compareVersions(a: string, b: string): number | undefined {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (pa === null || pb === null) return undefined;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return Math.sign(diff);
  }
  const [preA, preB] = [pa[4], pb[4]];
  if (preA === preB) return 0;
  if (preA === undefined) return 1;
  if (preB === undefined) return -1;
  return comparePrerelease(preA.split("."), preB.split("."));
}

/** Semver precedence of dot-separated prerelease identifiers: numbers numerically, below words. */
function comparePrerelease(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const [x, y] = [a[i] ?? "", b[i] ?? ""];
    if (x === y) continue;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny) return Math.sign(Number(x) - Number(y));
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return Math.sign(a.length - b.length);
}

// @decision(DL-043)
/** Refuses to overwrite files stamped with a newer dld-kit than `version`. */
export function checkDowngrade(stamps: readonly Stamp[], version: string): void {
  const newer = stamps.filter(
    (stamp) => stamp.version !== undefined && (compareVersions(stamp.version, version) ?? 0) > 0,
  );
  if (newer.length === 0) return;
  const list = newer.map((stamp) => `  ${stamp.path} (${stamp.version})`).join("\n");
  throw new DldError(
    `these files were installed by a newer dld-kit than this one (${version}):\n${list}\nUpgrade dld-kit, or pass --force to replace them with ${version}.`,
  );
}

export interface InstallRequest {
  /** Needed when `layouts` is not empty. */
  source?: InstallSource;
  layouts: ReadonlySet<SkillLayout>;
  rules: ReadonlySet<RuleChannel>;
  version: string;
  force?: boolean;
  /** The harnesses being installed for: they decide where a new rule block goes (DL-061). */
  harnesses?: readonly Harness[];
}

export interface InstallPlan {
  skills: { layout: SkillLayout; files: GeneratedFiles }[];
  rule: RulePlan;
  warnings: string[];
}

// @decision(DL-040) @decision(DL-043) @decision(DL-051)
/**
 * Renders everything an install writes, and checks it can be written, without touching the
 * project: a failure here leaves nothing half-installed.
 */
export function planInstall(ctx: Context, root: string, request: InstallRequest): InstallPlan {
  const layouts = LAYOUTS.filter((layout) => request.layouts.has(layout));
  for (const layout of layouts) {
    refuseSymlinkedDir(ctx, root, layout.dir);
    refuseSymlinkedSkills(ctx, root, layout);
  }
  if (!request.force) checkDowngrade(installedStamps(ctx, root), request.version);
  const skills = layouts.map((layout) => {
    const { source } = request;
    if (source === undefined) throw new DldError("installing skills needs the skill templates");
    const cli = new Map([
      [`${BUNDLED_CLI.skill}/${BUNDLED_CLI.path}`, { content: source.cli, mode: 0o755 }],
    ]);
    const files = generateSkills(ctx, source.templatesDir, layout.adapter, request.version, {
      extraFiles: cli,
    });
    return { layout, files };
  });
  const rule = planRule(ctx, root, request.rules, request.version, {
    harnesses: request.harnesses,
  });
  const warnings = layouts.length > 0 ? skillsLockWarning(ctx, root) : [];
  return { skills, rule, warnings };
}

export interface InstallReport {
  skills: { dir: string; written: number; removed: number; unchanged: number }[];
  /** Rule files written or removed, relative to the project root. */
  ruleWritten: string[];
  ruleRemoved: string[];
  warnings: string[];
}

// @decision(DL-043)
export function applyInstall(ctx: Context, root: string, plan: InstallPlan): InstallReport {
  const skills = plan.skills.map(({ layout, files }) => {
    const diff = writeOutput(ctx, join(root, layout.dir), files);
    const written = diff.changed.length + diff.missing.length;
    return {
      dir: layout.dir,
      written,
      removed: diff.extra.length,
      unchanged: files.size - written,
    };
  });
  applyRulePlan(ctx, root, plan.rule);
  return {
    skills,
    ruleWritten: plan.rule.writes.map((write) => write.path),
    ruleRemoved: plan.rule.removals,
    warnings: [...plan.warnings, ...plan.rule.warnings],
  };
}
