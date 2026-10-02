// Runs each ported command through the dispatcher against a temporary project.
import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { version } from "../../package.json";
import type { Context } from "../core/context.ts";
import { GitCommandError } from "../core/errors.ts";
import {
  branchedProject,
  captureIo,
  FLAT_CONFIG,
  NAMESPACED_CONFIG,
  recordText,
  type TempProject,
  tempProject,
} from "../test-helpers.ts";
import { EXIT_OK, EXIT_USAGE } from "./command.ts";
import { run } from "./index.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

function dld(p: TempProject, ...argv: string[]) {
  const io = captureIo();
  return { code: run(argv, io, p.ctx), out: io.out, err: io.err };
}

describe("create-config", () => {
  test("creates a namespaced config and reports the path", () => {
    project = tempProject(null);
    const result = dld(project, "create-config", "namespaced", "billing", "auth");
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toBe(`Created ${join(project.root, "dld.config.yaml")}\n`);
    expect(readFileSync(join(project.root, "dld.config.yaml"), "utf8")).toContain("  - auth\n");
  });

  test("needs a mode and rejects an invalid one", () => {
    project = tempProject(null);
    expect(dld(project, "create-config").code).toBe(EXIT_USAGE);
    expect(dld(project, "create-config", "nested").err).toBe(
      "Error: mode must be 'flat' or 'namespaced', got 'nested'.\n",
    );
  });
});

describe("init commands", () => {
  test("create-directories and create-empty-index set up an empty log", () => {
    project = tempProject(NAMESPACED_CONFIG);
    rmSync(join(project.root, "decisions"), { recursive: true, force: true });
    expect(dld(project, "create-directories").out).toBe("Created decisions directory structure.\n");
    expect(existsSync(join(project.root, "decisions/records/billing/.gitkeep"))).toBe(true);
    const index = join(project.root, "decisions/INDEX.md");
    expect(dld(project, "create-empty-index").out).toBe(`Created ${index}\n`);
    expect(readFileSync(index, "utf8")).toContain("| ID | Title | Status | Namespace | Tags |");
  });
});

describe("create-decision", () => {
  test("reads the body from stdin and prints the new record's path", () => {
    project = tempProject(undefined, { readStdin: () => "## Context\n\nFrom stdin\n" });
    const result = dld(
      project,
      "create-decision",
      "--id",
      "DL-001",
      "--title",
      "T",
      "--tags",
      "a,b",
      "--supersedes",
      "DL-000",
      "--amends",
      "",
      "--body-stdin",
    );
    const path = join(project.root, "decisions/records/DL-001.md");
    expect(result).toEqual({ code: EXIT_OK, out: `${path}\n`, err: "" });
    const text = readFileSync(path, "utf8");
    expect(text).toContain("supersedes: [DL-000]\namends: []\ntags: [a,b]\n");
    expect(text).toEndWith("\nFrom stdin\n");
  });

  test("does not read stdin unless asked", () => {
    project = tempProject(undefined, {
      readStdin: () => {
        throw new Error("stdin read");
      },
    });
    expect(dld(project, "create-decision", "--id", "DL-001", "--title", "T").code).toBe(EXIT_OK);
  });

  test("requires --id and --title", () => {
    project = tempProject();
    for (const args of [
      ["--id", "DL-001"],
      ["--title", "No ID"],
    ]) {
      expect(dld(project, "create-decision", ...args)).toEqual({
        code: 1,
        out: "",
        err: "Error: --id and --title are required.\n",
      });
    }
    expect(existsSync(join(project.root, "decisions/records"))).toBe(false);
  });
});

describe("update-status", () => {
  test("updates a record and reports it", () => {
    project = tempProject();
    project.write("decisions/records/DL-001.md", recordText("DL-001", "proposed"));
    expect(dld(project, "update-status", "DL-001", "accepted").out).toBe(
      "Updated DL-001 status to accepted.\n",
    );
  });

  test("validates its arguments", () => {
    project = tempProject();
    expect(dld(project, "update-status", "DL-001").code).toBe(EXIT_USAGE);
    expect(dld(project, "update-status", "DL-001", "accepted", "x").code).toBe(EXIT_USAGE);
    expect(dld(project, "update-status", "DL-001", "done").err).toBe(
      "Error: invalid status 'done'. Must be: proposed, accepted, deprecated, superseded.\n",
    );
  });
});

describe("regenerate-index", () => {
  test("reports an empty or populated index", () => {
    project = tempProject();
    project.write("decisions/records/.gitkeep");
    expect(dld(project, "regenerate-index").out).toBe("INDEX.md regenerated (empty).\n");
    project.write("decisions/records/DL-001.md", recordText("DL-001"));
    expect(dld(project, "regenerate-index").out).toBe("INDEX.md regenerated.\n");
    expect(readFileSync(join(project.root, "decisions/INDEX.md"), "utf8")).toContain(
      "| DL-001 | Test decision DL-001 | accepted | test, example |",
    );
  });

  test("fails when the records directory is missing", () => {
    project = tempProject();
    expect(dld(project, "regenerate-index").err).toContain("records directory not found");
  });

  test("replaces a stale INDEX.md", () => {
    project = tempProject();
    project.write("decisions/INDEX.md", "old content\n");
    project.write("decisions/records/DL-001.md", recordText("DL-001"));
    dld(project, "regenerate-index");
    const index = readFileSync(join(project.root, "decisions/INDEX.md"), "utf8");
    expect(index).toStartWith("# Decision Log");
    expect(index).not.toContain("old content");
  });

  test("--include-base adds base-only records and rejects an unknown ref", () => {
    const p = branchedProject();
    project = p;
    p.write("decisions/records/DL-002.md", recordText("DL-002"));
    p.commitAll("feature");
    p.onMain("land DL-003", () => p.write("decisions/records/DL-003.md", recordText("DL-003")));
    expect(dld(p, "regenerate-index", "--include-base", "main")).toEqual({
      code: EXIT_OK,
      out: "INDEX.md regenerated.\n",
      err: "",
    });
    const index = readFileSync(join(p.root, "decisions/INDEX.md"), "utf8");
    for (const id of ["DL-001", "DL-002", "DL-003"]) expect(index).toContain(`| ${id} |`);
    expect(dld(p, "regenerate-index", "--include-base", "does/not/exist")).toEqual({
      code: 1,
      out: "",
      err: "Error: --include-base ref 'does/not/exist' not found.\n",
    });
  });
});

describe("verify-annotations", () => {
  test("exits 0 when every ID is annotated and 1 listing the missing ones", () => {
    project = tempProject();
    project.write("src/a.ts", "// @decision(DL-001)\n");
    project.write("src/b.ts", "// @decision(DL-002)\n");
    expect(dld(project, "verify-annotations", "DL-001", "DL-002")).toEqual({
      code: EXIT_OK,
      out: "All decisions have code annotations.\n",
      err: "",
    });
    const missing = dld(project, "verify-annotations", "DL-001", "DL-003", "DL-004");
    expect(missing.code).toBe(1);
    expect(missing.out).toBe(
      "MISSING annotations in source code for: DL-003 DL-004\nEvery implemented decision must have at least one @decision(DL-NNN) annotation in the codebase.\n",
    );
  });

  test("does not count annotation examples in installed skills", () => {
    project = tempProject();
    for (const dir of [".agents", ".agent", ".codex", ".cursor", ".opencode", ".pi"]) {
      project.write(`${dir}/skills/dld-implement/SKILL.md`, "// @decision(DL-001)\n");
    }
    expect(dld(project, "verify-annotations", "DL-001").code).toBe(1);
    expect(dld(project, "find-annotations")).toEqual({ code: EXIT_OK, out: "", err: "" });
  });

  test("needs at least one ID", () => {
    project = tempProject();
    expect(dld(project, "verify-annotations").code).toBe(EXIT_USAGE);
  });
});

describe("audit commands", () => {
  test("find-annotations prints file:line:id and honours annotation_exclude", () => {
    project = tempProject("decisions_dir: decisions\nmode: flat\nannotation_exclude: [docs/**]\n");
    project.write("src/a.ts", "x\n// @decision(DL-001) replaces DL-005\n");
    project.write("docs/example.md", "@decision(DL-002)\n");
    expect(dld(project, "find-annotations")).toEqual({
      code: EXIT_OK,
      out: "src/a.ts:2:DL-001\n",
      err: "",
    });
  });

  test("find-missing-amends lists pairs; --all ignores the audit state", () => {
    project = tempProject();
    project.write("decisions/records/DL-002.md", `${recordText("DL-002")}Changes DL-001.\n`);
    expect(dld(project, "find-missing-amends").out).toBe("DL-002:DL-001\n");
    expect(dld(project, "find-missing-amends", "--all").out).toBe("DL-002:DL-001\n");
  });

  test("update-audit-state reports the time and commit", () => {
    project = tempProject();
    project.write("decisions/records/.gitkeep");
    const head = project.git("rev-parse", "--short", "HEAD").trim();
    expect(dld(project, "update-audit-state").out).toBe(
      `Audit state updated: 2026-01-15T10:00:00Z at ${head}\n`,
    );
  });
});

describe("snapshot commands", () => {
  test("collect, detect and update work together", () => {
    project = tempProject();
    project.write("decisions/records/DL-001.md", recordText("DL-001"));
    project.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    expect(dld(project, "collect-active-decisions").out).toBe(recordText("DL-001"));
    expect(dld(project, "detect-snapshot-changes").out).toBe("mode: full\n");

    project.write("decisions/SNAPSHOT.md");
    project.write("decisions/OVERVIEW.md");
    const head = project.git("rev-parse", "--short", "HEAD").trim();
    expect(dld(project, "update-snapshot-state", "ONBOARDING.md").out).toBe(
      `Snapshot state updated: 2026-01-15T10:00:00Z at ${head} (through DL-001)\n`,
    );
    expect(dld(project, "detect-snapshot-changes").out).toBe(
      "mode: incremental\nnew_decisions: \nmodified_decisions: \ncommit_range: \n",
    );
  });
});

describe("reindex commands", () => {
  const collide = () => {
    const p = branchedProject();
    project = p;
    p.onMain("land", () => p.write("decisions/records/DL-002.md", recordText("DL-002")));
    p.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    p.write("src/a.py", "# @decision(DL-002)\n# see DL-002\n");
    p.commitAll("local");
    return p;
  };
  const withStdin = (p: TempProject, input: string) => ({ ...p.ctx, readStdin: () => input });
  const plan = "decisions/records/DL-002.md\tDL-002\tDL-003\n";
  const notice = "[dld-reindex] open PRs not scanned: gh CLI not installed\n";

  test("resolve-base prints the base", () => {
    project = tempProject(null);
    expect(dld(project, "resolve-base")).toEqual({ code: EXIT_OK, out: "origin/main\n", err: "" });
  });

  test("planning commands print their results and the scan notice", () => {
    const p = collide();
    expect(dld(p, "list-taken-ids", "--base", "main")).toEqual({
      code: EXIT_OK,
      out: "DL-001\nDL-002\n",
      err: notice,
    });
    expect(dld(p, "find-collisions", "--base", "main")).toEqual({
      code: EXIT_OK,
      out: "decisions/records/DL-002.md\tDL-002\n",
      err: notice,
    });
    expect(dld(p, "plan-renames", "--base", "main")).toEqual({
      code: EXIT_OK,
      out: plan,
      err: notice,
    });
    expect(dld(p, "plan-renames").err).toBe("Error: base ref 'origin/main' not found.\n");
    expect(dld(p, "plan-renames", "--base", "-x").code).toBe(EXIT_USAGE);
    expect(dld(p, "find-collisions", "--base=--output=x").err).toContain(
      "--base must be a git ref, got '--output=x'",
    );
  });

  test("rename, stale mentions and commit run the whole flow", () => {
    const p = collide();
    expect(dld(p, "rename-decision", "--old", "DL-002", "--new", "DL-003")).toEqual({
      code: 1,
      out: "",
      err: "Error: --old, --new, and --path are required.\n",
    });
    const args = ["--old", "DL-002", "--new", "DL-003", "--path", "decisions/records/DL-002.md"];
    expect(dld(p, "rename-decision", ...args, "--base", "main").out).toBe(
      "decisions/records/DL-002.md -> decisions/records/DL-003.md\n",
    );

    expect(dld(p, "find-stale-mentions").err).toBe("Error: --base is required.\n");
    const stale = run(["find-stale-mentions", "--base", "main"], captureIo(), withStdin(p, plan));
    expect(stale).toBe(EXIT_OK);
    const io = captureIo();
    run(["find-stale-mentions", "--base", "main"], io, withStdin(p, plan));
    expect(io.out).toBe("src/a.py\t2\tDL-002\tDL-003\t# see DL-002\n");

    expect(dld(p, "commit-reindex").err).toBe("Error: --base is required.\n");
    const commitIo = captureIo();
    expect(run(["commit-reindex", "--base", "main"], commitIo, withStdin(p, plan))).toBe(EXIT_OK);
    expect(commitIo.out).toMatch(/^Created reindex commit [0-9a-f]+ on top of [0-9a-f]+\n$/);
  });
});

/** A fake npm package: the running CLI in dist/, with the real templates beside it. */
function fakePackage(p: TempProject): string {
  const pkg = join(p.root, "..", `${basename(p.root)}-pkg`);
  mkdirSync(join(pkg, "dist"), { recursive: true });
  writeFileSync(join(pkg, "dist/dld.mjs"), "// dld\n");
  cpSync(join(import.meta.dirname, "../../templates"), join(pkg, "templates"), {
    recursive: true,
  });
  const cleanup = p.cleanup;
  p.cleanup = () => {
    cleanup();
    rmSync(pkg, { recursive: true, force: true });
  };
  return join(pkg, "dist/dld.mjs");
}

async function dldInstall(p: TempProject, cli: string | undefined, ...argv: string[]) {
  const io = Object.assign(captureIo(), { cliPath: cli });
  const code = await run(argv, io, p.ctx);
  return { code, out: io.out, err: io.err };
}

describe("init", () => {
  test("sets up the log, the Claude Code skills and rule for a detected Claude project", async () => {
    project = tempProject(null);
    project.write("CLAUDE.md", "# Project\n");
    const result = await dldInstall(project, fakePackage(project), "init");
    expect(result.err).toBe("");
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toStartWith(
      "Created dld.config.yaml and decisions/INDEX.md\n.claude/skills: ",
    );
    expect(result.out).toContain("Wrote the DLD rule to .claude/rules/dld-workflow.md\n");
    expect(result.out).toContain("DLD is set up for: claude.");
    const read = (path: string) => readFileSync(join(project?.root ?? "", path), "utf8");
    expect(read("dld.config.yaml")).toContain("mode: flat\n");
    expect(read(".claude/skills/dld-common/scripts/dld.mjs")).toBe("// dld\n");
    expect(read(".claude/skills/dld-audit/SKILL.md")).toContain(`dld-kit-version: "${version}"`);
    expect(read(".claude/rules/dld-workflow.md")).toContain("the dld-lookup skill");
    expect(read("CLAUDE.md")).toBe("# Project\n");
    expect(existsSync(join(project.root, ".agents"))).toBe(false);
  });

  test("namespaced, for AGENTS.md readers named with --agent", async () => {
    project = tempProject(null);
    const cli = fakePackage(project);
    const result = await dldInstall(
      project,
      cli,
      "init",
      "--namespaces",
      "billing, auth",
      "--agent",
      "pi,opencode",
    );
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toContain("Wrote the DLD rule to AGENTS.md\n");
    expect(existsSync(join(project.root, "decisions/records/auth/.gitkeep"))).toBe(true);
    expect(existsSync(join(project.root, ".agents/skills/dld-common/SKILL.md"))).toBe(true);
    expect(readFileSync(join(project.root, "AGENTS.md"), "utf8")).toStartWith(
      "<!-- dld-kit:start -->\n",
    );
  });

  test("refuses an initialised project, and needs an agent when none is detected", async () => {
    project = tempProject();
    const cli = fakePackage(project);
    expect(await dldInstall(project, cli, "init", "--agent", "claude")).toMatchObject({
      code: 1,
      err: expect.stringContaining("DLD is already set up here (dld.config.yaml exists)"),
    });
    rmSync(join(project.root, "dld.config.yaml"));
    const none = await dldInstall(project, cli, "init");
    expect(none.code).toBe(EXIT_USAGE);
    expect(none.err).toContain("no agent detected in this project; name them with --agent");
    expect(existsSync(join(project.root, "dld.config.yaml"))).toBe(false);
  });

  test("validates its options before touching the project", async () => {
    project = tempProject(null);
    const cli = fakePackage(project);
    expect((await dldInstall(project, cli, "init", "--namespaces", " , ")).err).toContain(
      "--namespaces needs at least one namespace",
    );
    expect((await dldInstall(project, cli, "init", "--agent", "gemini")).err).toContain(
      "unknown agent 'gemini'; expected one of: claude, antigravity, codex, cursor, opencode, pi",
    );
    const bundled = await dldInstall(project, join(project.root, "dld.mjs"), "init");
    expect(bundled.err).toContain("npx dld-kit@latest init");
    expect(existsSync(join(project.root, "dld.config.yaml"))).toBe(false);
  });

  test("asks which agents to install for on an interactive terminal", async () => {
    project = tempProject(null);
    project.write(".cursor/rules/x.mdc", "");
    const answers = ["9", "4", "", "1, 3", ""];
    const io = Object.assign(captureIo(), {
      cliPath: fakePackage(project),
      prompt: async () => answers.shift() ?? "",
    });
    expect(await run(["init"], io, project.ctx)).toBe(EXIT_OK);
    expect(io.out).toContain("  4. [x] cursor       Cursor (found .cursor)\n");
    expect(io.out).toContain("Enter numbers from 1 to 6.\n");
    expect(io.out).toContain("Select at least one agent.\n");
    expect(io.out).toContain("DLD is set up for: claude, codex.");
    expect(answers).toEqual([]);
  });
});

describe("update", () => {
  async function initialised() {
    const p = tempProject(null);
    p.write("CLAUDE.md", "# Project\n");
    const cli = fakePackage(p);
    await dldInstall(p, cli, "init");
    return { p, cli };
  }

  test("rewrites edited skills, prunes stale files and adds agents", async () => {
    const { p, cli } = await initialised();
    project = p;
    p.write(".claude/skills/dld-audit/SKILL.md", "edited\n");
    p.write(".claude/skills/dld-old/SKILL.md", "stale\n");
    const result = await dldInstall(p, cli, "update", "--agent", "opencode");
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toMatch(/^\.claude\/skills: 1 written, 1 removed, \d+ unchanged\n/);
    expect(result.out).toContain(".agents/skills: ");
    // OpenCode reads only AGENTS.md; Claude Code keeps its rule file beside CLAUDE.md (DL-061).
    expect(result.out).toContain("Wrote the DLD rule to AGENTS.md\n");
    expect(result.out).not.toContain("Removed");
    expect(existsSync(join(p.root, ".claude/rules/dld-workflow.md"))).toBe(true);
    expect(existsSync(join(p.root, ".claude/skills/dld-old"))).toBe(false);
    const again = await dldInstall(p, cli, "update");
    expect(again.out).toMatch(/^\.claude\/skills: 0 written, 0 removed, \d+ unchanged\n/);
  });

  test("refuses to replace files from a newer dld-kit unless forced", async () => {
    const { p, cli } = await initialised();
    project = p;
    const skill = join(p.root, ".claude/skills/dld-audit/SKILL.md");
    writeFileSync(skill, readFileSync(skill, "utf8").replace(`"${version}"`, '"99.0.0"'));
    const refused = await dldInstall(p, cli, "update");
    expect(refused.code).toBe(1);
    expect(refused.err).toContain(".claude/skills/dld-audit/SKILL.md (99.0.0)");
    expect((await dldInstall(p, cli, "update", "--force")).code).toBe(EXIT_OK);
    expect(readFileSync(skill, "utf8")).toContain(`"${version}"`);
  });

  test("migrates a pre-1.0 Claude Code copy: installs the rule it never had", async () => {
    project = tempProject();
    const cli = fakePackage(project);
    project.write("CLAUDE.md", "# Project\n\n## DLD (Decision-Linked Development)\n\nOld rules\n");
    project.write(".claude/skills/dld-audit/SKILL.md", "---\nname: dld-audit\n---\nold\n");
    project.write(".claude/skills/dld-common/scripts/find-annotations.sh", "#!/bin/bash\n");
    project.write(".agents/skills/dld-audit/SKILL.md", "---\nname: dld-audit\n---\nold\n");
    const result = await dldInstall(project, cli, "update");
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toContain("Wrote the DLD rule to .claude/rules/dld-workflow.md\n");
    expect(result.err).toContain("so that section can be removed");
    expect(result.err).toContain(".agents/skills has the DLD skills, but no agent reading it");
    expect(
      existsSync(join(project.root, ".claude/skills/dld-common/scripts/find-annotations.sh")),
    ).toBe(false);
  });

  test("init replaces newer skills only with --force", async () => {
    project = tempProject(null);
    const cli = fakePackage(project);
    project.write(".claude/skills/dld-audit/SKILL.md", 'metadata:\n  dld-kit-version: "99.0.0"\n');
    expect((await dldInstall(project, cli, "init", "--yes")).err).toContain("(99.0.0)");
    expect(existsSync(join(project.root, "dld.config.yaml"))).toBe(false);
    expect((await dldInstall(project, cli, "init", "--yes", "--force")).code).toBe(EXIT_OK);
  });

  test("needs an initialised project with something installed", async () => {
    project = tempProject(null);
    const cli = fakePackage(project);
    expect((await dldInstall(project, cli, "update")).err).toContain(
      "DLD is not set up here (dld.config.yaml not found). Run dld init first.",
    );
    project.write("dld.config.yaml", "decisions_dir: decisions\nmode: flat\n");
    const nothing = await dldInstall(project, cli, "update");
    expect(nothing.code).toBe(EXIT_USAGE);
    expect(nothing.err).toContain("no DLD skills or rule are installed yet");
  });
});

describe("install-rule", () => {
  test("installs the rule without skills or templates, then reports it up to date", async () => {
    project = tempProject();
    const first = await dldInstall(project, undefined, "install-rule", "--agent", "antigravity");
    expect(first.out).toBe("Wrote the DLD rule to .agents/rules/dld-workflow.md\n");
    expect(readFileSync(join(project.root, ".agents/rules/dld-workflow.md"), "utf8")).toStartWith(
      "---\ntrigger: always_on\n---\n",
    );
    expect((await dldInstall(project, undefined, "install-rule")).out).toBe(
      "The DLD rule is up to date.\n",
    );
    expect(existsSync(join(project.root, ".agents/skills"))).toBe(false);
  });

  test("puts Codex's block in a new AGENTS.md beside CLAUDE.md, and needs an agent when nothing is installed", async () => {
    project = tempProject();
    expect((await dldInstall(project, undefined, "install-rule")).code).toBe(EXIT_USAGE);
    project.write("CLAUDE.md", "# C\n");
    const result = await dldInstall(project, undefined, "install-rule", "--agent", "codex");
    expect(result).toMatchObject({ out: "Wrote the DLD rule to AGENTS.md\n", err: "" });
    expect(readFileSync(join(project.root, "CLAUDE.md"), "utf8")).toBe("# C\n");
  });

  test("warns about a block Codex cannot see in CLAUDE.md", async () => {
    project = tempProject();
    project.write("CLAUDE.md", "# C\n");
    await dldInstall(project, undefined, "install-rule", "--agent", "pi");
    const result = await dldInstall(project, undefined, "install-rule", "--agent", "codex");
    expect(result.err).toContain(
      "Warning: The dld-kit rule block is in CLAUDE.md, but Codex reads AGENTS.md.",
    );
  });
});

describe("init and update with Claude Code and a block reader (DL-054, DL-055)", () => {
  test("puts the block in a new AGENTS.md, imports it for Claude Code, and warns about nothing", async () => {
    project = tempProject(null);
    const { code, err, out } = await dldInstall(
      project,
      fakePackage(project),
      "init",
      "--yes",
      "--agent",
      "claude,opencode",
    );
    expect(code).toBe(EXIT_OK);
    expect(out).toContain(
      "Wrote the DLD rule to AGENTS.md\nWrote .claude/CLAUDE.md (imports AGENTS.md for Claude Code)\n",
    );
    expect(err).toBe("");
    expect(existsSync(join(project.root, ".claude/rules/dld-workflow.md"))).toBe(false);
    expect(readFileSync(join(project.root, "AGENTS.md"), "utf8")).toContain(
      "<!-- dld-kit:start -->",
    );
    expect(readFileSync(join(project.root, ".claude/CLAUDE.md"), "utf8")).toEndWith(
      "\n\n@../AGENTS.md\n",
    );
    expect(dld(project, "session-context", "--agent", "claude").out).toBe("");
  });

  test("update adds the import to a project that relied on Claude Code reading AGENTS.md", async () => {
    project = tempProject(null);
    await dldInstall(project, fakePackage(project), "init", "--yes", "--agent", "claude,opencode");
    rmSync(join(project.root, ".claude/CLAUDE.md"));
    const { code, err, out } = await dldInstall(project, fakePackage(project), "update");
    expect(code).toBe(EXIT_OK);
    expect(err).toBe("");
    expect(out).toContain("Wrote .claude/CLAUDE.md (imports AGENTS.md for Claude Code)\n");
    // A CLAUDE.md added later keeps the rule loading through the import, without a second copy.
    project.write("CLAUDE.md", "# Project\n");
    const again = await dldInstall(project, fakePackage(project), "update");
    expect(again.out).not.toContain("Wrote");
    expect(existsSync(join(project.root, ".claude/rules/dld-workflow.md"))).toBe(false);
    expect(dld(project, "session-context", "--agent", "claude").out).toBe("");
  });
});

describe("session-context", () => {
  test("prints the rule in a DLD project until Claude Code loads it", async () => {
    project = tempProject();
    const first = dld(project, "session-context", "--agent", "claude");
    expect(first).toMatchObject({ code: EXIT_OK, err: "" });
    expect(first.out).toStartWith("# DLD (Decision-Linked Development)\n");
    expect(first.out).not.toContain("Generated by dld-kit");
    await dldInstall(project, undefined, "install-rule", "--agent", "claude");
    expect(dld(project, "session-context", "--agent", "claude")).toEqual({
      code: EXIT_OK,
      out: "",
      err: "",
    });
  });

  test("prints nothing outside a DLD project or a git repository", () => {
    project = tempProject(null);
    expect(dld(project, "session-context", "--agent", "claude")).toEqual({
      code: EXIT_OK,
      out: "",
      err: "",
    });
    const outside = tempProject(FLAT_CONFIG, {
      git: () => {
        throw new GitCommandError(["rev-parse"], "not a git repository", 128);
      },
    });
    try {
      expect(dld(outside, "session-context", "--agent", "claude")).toEqual({
        code: EXIT_OK,
        out: "",
        err: "",
      });
    } finally {
      outside.cleanup();
    }
  });

  test("reports other errors on stderr and still exits 0", () => {
    project = tempProject();
    project.write("CLAUDE.md", "# C\n");
    const failing: Context = {
      ...project.ctx,
      fs: {
        ...project.ctx.fs,
        readFile: () => {
          throw new Error("EIO: i/o error, read");
        },
      },
    };
    const io = captureIo();
    const result = { code: run(["session-context", "--agent", "claude"], io, failing), ...io };
    expect(result.code).toBe(EXIT_OK);
    expect(result.out).toBe("");
    expect(result.err).toStartWith("dld session-context: ");
  });

  test("needs exactly one known agent", () => {
    project = tempProject();
    for (const args of [[], ["--agent", "claude,pi"], ["--agent", "gemini"]]) {
      expect(dld(project, "session-context", ...args).code).toBe(EXIT_USAGE);
    }
  });
});

// @decision(DL-066) @decision(DL-067)
describe("check-decision-edits", () => {
  test("lists edited decisions and fails only under decision_edits: block", () => {
    const p = branchedProject();
    project = p;
    expect(dld(p, "check-decision-edits")).toEqual({ code: EXIT_OK, out: "", err: "" });
    p.write(
      "decisions/records/DL-001.md",
      recordText("DL-001").replace("Test context", "New context"),
    );
    const line = "decisions/records/DL-001.md\tDL-001\tedited\n";
    expect(dld(p, "check-decision-edits", "--base", "main")).toEqual({
      code: 1,
      out: line,
      err: "",
    });
    p.write("dld.config.yaml", "decisions_dir: decisions\nmode: flat\ndecision_edits: ask\n");
    expect(dld(p, "check-decision-edits", "DL-001")).toEqual({ code: EXIT_OK, out: line, err: "" });
  });

  test("rejects arguments that are not decision IDs", () => {
    project = branchedProject();
    for (const command of ["check-decision-edits", "restore-decision-prose"]) {
      expect(dld(project, command, "x").code).toBe(EXIT_USAGE);
      expect(dld(project, command, "--base", "-x", "DL-001").code).toBe(EXIT_USAGE);
    }
    expect(dld(project, "restore-decision-prose").code).toBe(EXIT_USAGE);
  });

  // @decision(DL-068)
  test("restore-decision-prose puts the body back", () => {
    const p = branchedProject();
    project = p;
    p.write("decisions/records/DL-001.md", recordText("DL-001").replace("Test context", "New"));
    expect(dld(p, "restore-decision-prose", "DL-001")).toEqual({
      code: EXIT_OK,
      out: "Restored decisions/records/DL-001.md\n",
      err: "",
    });
    expect(dld(p, "check-decision-edits").code).toBe(EXIT_OK);
  });
});
