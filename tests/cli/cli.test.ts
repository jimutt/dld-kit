// @decision(DL-004)
// Runs the built bundle under node; build first with `npm run build`.
import { afterAll, describe, expect, test } from "bun:test";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { version } from "../../package.json";

const BIN = resolve(import.meta.dirname, "../../dist/dld.mjs");

const WORKDIR = realpathSync(mkdtempSync(join(tmpdir(), "dld-cli-")));
afterAll(() => rmSync(WORKDIR, { recursive: true, force: true }));

function dld(...args: string[]) {
  return dldIn(WORKDIR, ...args);
}

function dldIn(cwd: string, ...args: string[]) {
  return dldWithInput(cwd, "", ...args);
}

/** The environment without GIT_* variables, so a surrounding git hook cannot redirect a fixture. */
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

function dldWithInput(cwd: string, input: string, ...args: string[]) {
  const result = spawnSync("node", [BIN, ...args], { cwd, input, encoding: "utf8", env: ENV });
  if (result.error) throw result.error;
  return result;
}

describe("dld (built, under node)", () => {
  test("--version matches package.json", () => {
    const result = dld("--version");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${version}\n`);
  });

  test("--help prints usage", () => {
    const result = dld("--help");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage: dld");
  });

  test("unknown command exits 2 with a message on stderr", () => {
    const result = dld("frobnicate");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown command or option 'frobnicate'");
  });
});

describe("next-id (built, under node)", () => {
  const project = join(WORKDIR, "project");
  mkdirSync(join(project, "decisions/records/billing"), { recursive: true });
  execFileSync("git", ["init", "--quiet"], { cwd: project });
  writeFileSync(join(project, "dld.config.yaml"), "decisions_dir: decisions\nmode: flat\n");
  writeFileSync(join(project, "decisions/records/billing/DL-009.md"), "");

  test("prints the next ID from a subdirectory of the project", () => {
    const result = dldIn(join(project, "decisions"), "next-id");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("DL-010\n");
  });

  test("create-decision reads the body from standard input", () => {
    const result = dldWithInput(
      project,
      "## Context\n\nPiped body\n",
      "create-decision",
      "--id",
      "DL-010",
      "--title",
      "Piped",
      "--body-stdin",
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const path = join(project, "decisions/records/DL-010.md");
    expect(result.stdout).toBe(`${path}\n`);
    expect(readFileSync(path, "utf8")).toEndWith("---\n\n## Context\n\nPiped body\n");
  });

  test("fails without stdout when the config is missing", () => {
    const bare = join(WORKDIR, "bare");
    mkdirSync(bare);
    execFileSync("git", ["init", "--quiet"], { cwd: bare });
    const result = dldIn(bare, "next-id");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Error: dld.config.yaml not found. Run /dld-init first.\n");
  });

  test("fails outside a git repository", () => {
    const result = dld("next-id");
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("Error: not a git repository\n");
  });
});

describe("list-taken-ids with gh (built, under node)", () => {
  test("adds IDs from open PRs reported by gh on PATH", () => {
    const project = join(WORKDIR, "gh-project");
    mkdirSync(join(project, "decisions/records"), { recursive: true });
    writeFileSync(join(project, "dld.config.yaml"), "decisions_dir: decisions\nmode: flat\n");
    writeFileSync(join(project, "decisions/records/DL-001.md"), "");
    const git = (...args: string[]) => execFileSync("git", args, { cwd: project });
    git("init", "--quiet", "-b", "main");
    git("remote", "add", "origin", "git@github.com:o/r.git");
    git("add", ".");
    git("-c", "user.name=T", "-c", "user.email=t@t", "commit", "--quiet", "-m", "seed");

    const bin = join(WORKDIR, "gh-bin");
    mkdirSync(bin);
    const prs = JSON.stringify([
      { headRefName: "x", files: [{ path: "decisions/records/DL-004.md" }] },
    ]);
    writeFileSync(join(bin, "gh"), `#!/bin/sh\n[ "$1" = pr ] && echo '${prs}'\nexit 0\n`);
    chmodSync(join(bin, "gh"), 0o755);

    const result = spawnSync("node", [BIN, "list-taken-ids", "--base", "main"], {
      cwd: project,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("DL-001\nDL-004\n");
  });
});

describe("reindex end to end (built, under node)", () => {
  const FLAT = "decisions_dir: decisions\nmode: flat\n";
  const NAMESPACED =
    "decisions_dir: decisions\nmode: namespaced\nnamespaces:\n  - billing\n  - auth\n";

  /** A project on branch `feature`, whose `main` holds DL-001 and a regenerated INDEX.md. */
  function project(name: string, config: string, firstRecordDir = "decisions/records") {
    const root = join(WORKDIR, name);
    mkdirSync(join(root, firstRecordDir), { recursive: true });
    writeFileSync(join(root, "dld.config.yaml"), config);
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8", env: ENV });
    const record = (dir: string, id: string, status: string) => {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(
        join(root, dir, `${id}.md`),
        `---\nid: ${id}\ntitle: "T ${id}"\ntimestamp: 2026-01-15T10:00:00Z\nstatus: ${status}\nsupersedes: []\namends: []\ntags: []\nreferences: []\n---\n\nBody.\n`,
      );
    };
    const run = (input: string, ...args: string[]) => {
      const result = dldWithInput(root, input, ...args);
      expect({ args, status: result.status, stderr: result.stderr }).toMatchObject({
        args,
        status: 0,
      });
      return result.stdout;
    };
    const commit = (message: string) => {
      git("add", "-A");
      git("commit", "--quiet", "-m", message);
    };
    git("init", "--quiet", "-b", "main");
    // A local identity: commit-reindex commits too, and CI has no global git config.
    git("config", "user.name", "T");
    git("config", "user.email", "t@t");
    record(firstRecordDir, "DL-001", "accepted");
    run("", "regenerate-index");
    commit("seed main");
    git("checkout", "--quiet", "-b", "feature");
    const onMain = (change: () => void, message: string) => {
      git("checkout", "--quiet", "main");
      change();
      run("", "regenerate-index");
      commit(message);
      git("checkout", "--quiet", "feature");
    };
    const reindex = () => {
      const plan = run("", "plan-renames", "--base", "main");
      for (const line of plan.trim().split("\n")) {
        const [path = "", oldId = "", newId = ""] = line.split("\t");
        run(
          "",
          "rename-decision",
          "--old",
          oldId,
          "--new",
          newId,
          "--path",
          path,
          "--base",
          "main",
        );
      }
      run(plan, "commit-reindex", "--base", "main");
      return plan;
    };
    const read = (path: string) => readFileSync(join(root, path), "utf8");
    return { root, git, record, run, commit, onMain, reindex, read };
  }

  test("flat: renames collisions, rewrites annotations and rebases cleanly", () => {
    const p = project("reindex-flat", FLAT);
    p.onMain(() => {
      for (const id of ["DL-002", "DL-003", "DL-004"])
        p.record("decisions/records", id, "accepted");
    }, "land DL-002..DL-004");
    p.record("decisions/records", "DL-002", "proposed");
    p.record("decisions/records", "DL-003", "proposed");
    mkdirSync(join(p.root, "src"));
    writeFileSync(join(p.root, "src/auth.py"), "# @decision(DL-002)\n");
    writeFileSync(join(p.root, "src/billing.py"), "# @decision(DL-003)\n");
    p.run("", "regenerate-index");
    p.commit("feature: DL-002 and DL-003");

    expect(p.reindex()).toBe(
      "decisions/records/DL-002.md\tDL-002\tDL-005\ndecisions/records/DL-003.md\tDL-003\tDL-006\n",
    );
    p.git("rebase", "--quiet", "main");
    expect(p.read("decisions/records/DL-002.md")).toContain("status: accepted");
    expect(p.read("decisions/records/DL-005.md")).toContain("id: DL-005");
    expect(p.read("decisions/records/DL-006.md")).toContain("id: DL-006");
    expect(p.read("src/auth.py")).toBe("# @decision(DL-005)\n");
    expect(p.read("src/billing.py")).toBe("# @decision(DL-006)\n");
    expect(p.read("decisions/INDEX.md")).not.toMatch(/DL-00[56]/);
    p.run("", "regenerate-index");
    expect(p.read("decisions/INDEX.md")).toMatch(/\| DL-006 \|[\s\S]*\| DL-005 \|/);
  });

  test("namespaced: keeps the namespace directory and rebases cleanly", () => {
    const p = project("reindex-ns", NAMESPACED, "decisions/records/auth");
    p.onMain(() => p.record("decisions/records/billing", "DL-002", "accepted"), "land DL-002");
    p.record("decisions/records/auth", "DL-002", "proposed");
    p.commit("feature: auth DL-002");
    expect(p.run("", "find-collisions", "--base", "main")).toBe(
      "decisions/records/auth/DL-002.md\tDL-002\n",
    );
    p.reindex();
    expect(existsSync(join(p.root, "decisions/records/auth/DL-002.md"))).toBe(false);
    expect(existsSync(join(p.root, "decisions/records/auth/DL-003.md"))).toBe(true);
    p.git("rebase", "--quiet", "main");
    expect(existsSync(join(p.root, "decisions/records/billing/DL-002.md"))).toBe(true);
    expect(existsSync(join(p.root, "decisions/records/auth/DL-003.md"))).toBe(true);
  });
});

// @decision(DL-040) @decision(DL-042)
describe("init and update (built, under node)", () => {
  const project = join(WORKDIR, "installed");
  mkdirSync(project);
  execFileSync("git", ["init", "--quiet"], { cwd: project, env: ENV });
  writeFileSync(join(project, "CLAUDE.md"), "# Project\n");

  test("init installs the running bundle, the skills and the rule", () => {
    const result = dldIn(project, "init", "--agent", "pi", "--yes");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("DLD is set up for: claude, pi.");
    for (const dir of [".claude/skills", ".agents/skills"]) {
      const cli = join(project, dir, "dld-common/scripts/dld.mjs");
      expect(readFileSync(cli, "utf8")).toBe(readFileSync(BIN, "utf8"));
    }
    expect(readFileSync(join(project, "CLAUDE.md"), "utf8")).toContain("<!-- dld-kit:start -->");
    expect(existsSync(join(project, ".claude/rules/dld-workflow.md"))).toBe(false);
  });

  test("the installed copy runs commands but cannot install skills", () => {
    const installed = join(project, ".agents/skills/dld-common/scripts/dld.mjs");
    const run = (...args: string[]) =>
      spawnSync("node", [installed, ...args], { cwd: project, encoding: "utf8", env: ENV });
    expect(run("next-id").stdout).toBe("DL-001\n");
    const update = run("update");
    expect(update.status).toBe(1);
    expect(update.stderr).toContain("npx dld-kit@latest update");
    expect(run("install-rule").stdout).toBe("The DLD rule is up to date.\n");
  });

  test("update reports every installed location as unchanged", () => {
    const result = dldIn(project, "update");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(
      /^\.claude\/skills: 0 written, 0 removed, \d+ unchanged\n\.agents\/skills: 0 written/,
    );
  });

  // @decision(DL-049)
  test("session-context prints the rule until Claude Code loads it", () => {
    const silent = dldIn(project, "session-context", "--agent", "claude");
    expect(silent).toMatchObject({ status: 0, stdout: "", stderr: "" });
    const fresh = join(WORKDIR, "hook");
    mkdirSync(fresh);
    execFileSync("git", ["init", "--quiet"], { cwd: fresh, env: ENV });
    writeFileSync(join(fresh, "dld.config.yaml"), "decisions_dir: decisions\nmode: flat\n");
    const result = dldIn(fresh, "session-context", "--agent", "claude");
    expect(result).toMatchObject({ status: 0, stderr: "" });
    expect(result.stdout).toStartWith("# DLD (Decision-Linked Development)\n");
  });
});

// @decision(DL-057)
describe("upgrading a pre-1.0 project (built, under node)", () => {
  const project = join(WORKDIR, "legacy");
  const write = (path: string, content: string) => {
    mkdirSync(join(project, path, ".."), { recursive: true });
    writeFileSync(join(project, path), content);
  };
  const record = (id: string, title: string, amends: string) =>
    `---\nid: ${id}\ntitle: "${title}"\ntimestamp: 2026-01-10T09:00:00Z\nstatus: accepted\nsupersedes: []\namends: [${amends}]\ntags: [net]\nreferences: []\n---\n\n## Context\n\nC.\n`;
  const legacyClaudeMd =
    "# App\n\n## DLD (Decision-Linked Development)\n\nThis project uses Decision-Linked Development.\n\n### Rules\n\n- Use `/dld-lookup` to query decisions.\n";
  const index =
    "# Decision Log\n\n| ID | Title | Status | Tags |\n|----|-------|--------|------|\n| DL-002 | Retry limit | accepted | net |\n| DL-001 | Use retries | accepted | net |\n";
  const state =
    "audit:\n  last_run: 2026-01-10T09:00:00Z\n  commit_hash: abc1234\n\nsnapshot:\n  last_run: 2026-01-10T09:00:00Z\n  commit_hash: abc1234\n  decisions_included: 2\n  artifacts:\n    SNAPSHOT.md: 2026-01-10T09:00:00Z\n    OVERVIEW.md: 2026-01-10T09:00:00Z\n";

  // What the 0.x dld-init and bash scripts left behind: unstamped skills with scripts/*.sh.
  mkdirSync(project);
  execFileSync("git", ["init", "--quiet"], { cwd: project, env: ENV });
  write(
    ".claude/skills/dld-decide/SKILL.md",
    "---\nname: dld-decide\ndescription: Record a decision.\nuser_invocable: true\n---\n\n# /dld-decide\n",
  );
  write(".claude/skills/dld-decide/scripts/create-decision.sh", "#!/usr/bin/env bash\n");
  write(".claude/skills/dld-common/scripts/common.sh", "#!/usr/bin/env bash\n");
  write(".claude/skills/dld-common/scripts/next-id.sh", "#!/usr/bin/env bash\n");
  write("dld.config.yaml", "decisions_dir: decisions\nmode: flat\nannotation_prefix: '@decision'\n");
  write("decisions/records/DL-001.md", record("DL-001", "Use retries", ""));
  write("decisions/records/DL-002.md", record("DL-002", "Retry limit", "DL-001"));
  write("decisions/INDEX.md", index);
  write("decisions/.dld-state.yaml", state);
  write("CLAUDE.md", legacyClaudeMd);
  write("src/net.ts", "// @decision(DL-001)\nexport const retries = 3;\n");

  test("update replaces the copied skills and installs the rule, leaving the data as it is", () => {
    // The README's step for adding Codex: an AGENTS.md for the block.
    write("AGENTS.md", "");
    const result = dldIn(project, "update", "--agent", "claude,codex");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Wrote the DLD rule to AGENTS.md\n");
    expect(result.stdout).toContain("Wrote the DLD rule to .claude/rules/dld-workflow.md\n");
    expect(result.stderr).toBe(
      "Warning: CLAUDE.md has a '## DLD (Decision-Linked Development)' section from an older dld-init. dld-kit now installs the rule separately, so that section can be removed.\n",
    );
    expect(readFileSync(join(project, "CLAUDE.md"), "utf8")).toBe(legacyClaudeMd);
    expect(existsSync(join(project, ".claude/skills/dld-decide/scripts"))).toBe(false);
    expect(existsSync(join(project, ".claude/skills/dld-common/scripts/next-id.sh"))).toBe(false);
    expect(readFileSync(join(project, ".claude/skills/dld-decide/SKILL.md"), "utf8")).toContain(
      `dld-kit-version: "${version}"`,
    );
    expect(existsSync(join(project, ".agents/skills/dld-decide/SKILL.md"))).toBe(true);
  });

  test("the installed skills read the existing records, index and state", () => {
    const run = (...args: string[]) =>
      spawnSync("node", [join(project, ".claude/skills/dld-common/scripts/dld.mjs"), ...args], {
        cwd: project,
        encoding: "utf8",
        env: ENV,
      });
    expect(run("next-id").stdout).toBe("DL-003\n");
    expect(run("verify-annotations", "DL-001").status).toBe(0);
    expect(run("find-missing-amends").stdout).toBe("");
    expect(run("regenerate-index").status).toBe(0);
    expect(readFileSync(join(project, "decisions/INDEX.md"), "utf8")).toBe(index);
    write("decisions/SNAPSHOT.md", "");
    write("decisions/OVERVIEW.md", "");
    expect(run("detect-snapshot-changes").stdout).toStartWith("mode: incremental\n");
    expect(readFileSync(join(project, "decisions/.dld-state.yaml"), "utf8")).toBe(state);
  });
});

describe("output to a closed pipe", () => {
  test("exits quietly instead of crashing on EPIPE", async () => {
    const child = spawn("node", [BIN, "--help"], {
      cwd: WORKDIR,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.destroy();
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const code = await new Promise((resolve) => child.on("close", resolve));
    expect(stderr).toBe("");
    expect(code).toBe(0);
  });
});
