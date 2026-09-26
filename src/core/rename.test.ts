import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, lstatSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type BranchedProject,
  branchedProject,
  FLAT_CONFIG,
  recordText,
  type TempProject,
} from "../test-helpers.ts";
import { loadProject } from "./project.ts";
import { findStaleMentions, formatStaleMention, renameDecision } from "./rename.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

function branched(config = FLAT_CONFIG): BranchedProject {
  const p = branchedProject(config);
  project = p;
  return p;
}

const read = (p: TempProject, path: string) => readFileSync(join(p.root, path), "utf8");
const rename = (p: TempProject, oldId: string, newId: string, dir = "decisions/records") =>
  renameDecision(p.ctx, loadProject(p.ctx), { path: `${dir}/${oldId}.md`, oldId, newId }, "main");

describe("renameDecision", () => {
  test("renames with git mv and rewrites the record, other records and annotations", () => {
    const p = branched();
    p.write(
      "decisions/records/DL-002.md",
      recordText("DL-002", "proposed").replace("## Context", "About DL-002, not DL-0020."),
    );
    p.write("decisions/records/DL-003.md", recordText("DL-003", "proposed", "x: [DL-002]\n"));
    p.write("src/a.py", "# @decision(DL-002)\n# see DL-002\n");
    p.commitAll("local");

    expect(rename(p, "DL-002", "DL-007")).toBe("decisions/records/DL-007.md");
    expect(read(p, "decisions/records/DL-007.md")).toContain("id: DL-007\n");
    expect(read(p, "decisions/records/DL-007.md")).toContain("About DL-007, not DL-0020.");
    expect(read(p, "decisions/records/DL-003.md")).toContain("x: [DL-007]");
    expect(read(p, "src/a.py")).toBe("# @decision(DL-007)\n# see DL-002\n");
    expect(p.git("status", "--porcelain")).toContain(
      "decisions/records/DL-002.md -> decisions/records/DL-007.md",
    );
  });

  test("leaves annotations in excluded, unchanged, binary and symlinked files alone", () => {
    const p = branched(`${FLAT_CONFIG}annotation_exclude:\n  - docs/**\n`);
    p.write("src/untouched.py", "# @decision(DL-002)\n");
    p.commitAll("before");
    p.git("branch", "-f", "main");
    p.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    p.write("docs/example.md", "`@decision(DL-002)`\n");
    p.write("src/blob.bin", "\0@decision(DL-002)");
    p.write("src/target.py", "# @decision(DL-002)\n");
    symlinkSync("target.py", join(p.root, "src/link.py"));
    p.commitAll("local");
    writeFileSync(join(p.root, "src/untouched.py"), "# @decision(DL-002)\n");

    rename(p, "DL-002", "DL-007");
    expect(read(p, "docs/example.md")).toBe("`@decision(DL-002)`\n");
    expect(read(p, "src/blob.bin")).toBe("\0@decision(DL-002)");
    expect(read(p, "src/untouched.py")).toBe("# @decision(DL-002)\n");
    expect(read(p, "src/target.py")).toBe("# @decision(DL-007)\n");
    expect(lstatSync(join(p.root, "src/link.py")).isSymbolicLink()).toBe(true);
  });

  test("keeps bytes, line endings and mode, and uses a literal custom prefix", () => {
    const p = branched(FLAT_CONFIG.replace("'@decision'", "'@dé.cision'"));
    p.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    const bytes = Buffer.concat([
      Buffer.from("#!/bin/sh\r\n# @dé.cision(DL-002) \xff\r\n", "latin1"),
      Buffer.from("# @dé.cision(DL-002)\r\n# @dXcision(DL-002)\n", "utf8"),
    ]);
    writeFileSync(join(p.root, "run.sh"), bytes);
    chmodSync(join(p.root, "run.sh"), 0o755);
    p.commitAll("local");

    rename(p, "DL-002", "DL-010");
    const after = readFileSync(join(p.root, "run.sh"));
    expect(after.toString("latin1")).toBe(
      bytes
        .toString("latin1")
        .replace(
          Buffer.from("@dé.cision(DL-002)\r\n# @dX", "utf8").toString("latin1"),
          Buffer.from("@dé.cision(DL-010)\r\n# @dX", "utf8").toString("latin1"),
        ),
    );
    expect(lstatSync(join(p.root, "run.sh")).mode & 0o777).toBe(0o755);
  });

  test("renames a CRLF record, keeping its line endings", () => {
    const p = branched();
    const crlf = recordText("DL-002", "proposed").replaceAll("\n", "\r\n");
    p.write("decisions/records/DL-002.md", crlf);
    p.commitAll("local");
    rename(p, "DL-002", "DL-003");
    expect(read(p, "decisions/records/DL-003.md")).toBe(crlf.replaceAll("DL-002", "DL-003"));
  });

  test("changes nothing when the base has no merge-base with HEAD", () => {
    const p = branched();
    p.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    p.commitAll("local");
    p.git("checkout", "--quiet", "--orphan", "other");
    p.git("commit", "--quiet", "--allow-empty", "-m", "unrelated");
    p.git("checkout", "--quiet", "feature");
    expect(() =>
      renameDecision(
        p.ctx,
        loadProject(p.ctx),
        { path: "decisions/records/DL-002.md", oldId: "DL-002", newId: "DL-003" },
        "other",
      ),
    ).toThrow("merge-base");
    expect(p.git("status", "--porcelain")).toBe("");
  });

  test("treats a dangling symlink at the target as existing", () => {
    const p = branched();
    p.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    p.commitAll("local");
    symlinkSync("nowhere", join(p.root, "decisions/records/DL-003.md"));
    expect(() => rename(p, "DL-002", "DL-003")).toThrow(
      "decisions/records/DL-003.md already exists.",
    );
  });

  test("a second rename also updates the file renamed by the first", () => {
    const p = branched();
    const withBody = (id: string, amends: string, body: string) =>
      recordText(id, "proposed")
        .replace("amends: []", `amends: [${amends}]`)
        .replace("## Context", body);
    p.write(
      "decisions/records/DL-205.md",
      withBody("DL-205", "", "This decision precedes DL-206. See DL-206 for the follow-up."),
    );
    p.write("decisions/records/DL-206.md", withBody("DL-206", "DL-205", "Builds on DL-205."));
    p.commitAll("local");
    rename(p, "DL-205", "DL-211");
    rename(p, "DL-206", "DL-212");
    const first = read(p, "decisions/records/DL-211.md");
    expect(first).toContain("precedes DL-212");
    expect(first).toContain("See DL-212");
    expect(first).not.toContain("DL-206");
    const second = read(p, "decisions/records/DL-212.md");
    expect(second).toContain("amends: [DL-211]");
    expect(second).toContain("Builds on DL-211");
  });

  test("keeps the namespace directory", () => {
    const p = branched();
    p.write("decisions/records/auth/DL-002.md", recordText("DL-002", "proposed"));
    p.commitAll("local");
    expect(rename(p, "DL-002", "DL-003", "decisions/records/auth")).toBe(
      "decisions/records/auth/DL-003.md",
    );
  });

  test("checks the arguments, the record and the target before changing anything", () => {
    const p = branched();
    p.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    p.write("decisions/records/DL-004.md", recordText("DL-009", "proposed"));
    p.write("decisions/records/DL-007.md", recordText("DL-007", "proposed"));
    p.commitAll("local");
    expect(() => rename(p, "DL-002", "bad")).toThrow("IDs must match DL-[0-9]+.");
    expect(() => rename(p, "DL-005", "DL-006")).toThrow("decisions/records/DL-005.md not found.");
    expect(() => rename(p, "DL-004", "DL-006")).toThrow(
      "decisions/records/DL-004.md has id DL-009, not DL-004.",
    );
    expect(() => rename(p, "DL-002", "DL-007")).toThrow(
      "decisions/records/DL-007.md already exists.",
    );
    const project = loadProject(p.ctx);
    const args = { path: "decisions/records/DL-002.md", oldId: "DL-002", newId: "DL-008" };
    expect(() => renameDecision(p.ctx, project, args, "nope")).toThrow("base ref 'nope'");
    expect(p.git("status", "--porcelain")).toBe("");
  });
});

describe("findStaleMentions", () => {
  const plan = "decisions/records/DL-002.md\tDL-002\tDL-007\n";

  test("lists bare mentions in changed files outside decisions, including excluded ones", () => {
    const p = branched(`${FLAT_CONFIG}annotation_exclude:\n  - docs/**\n`);
    p.write("decisions/records/DL-002.md", recordText("DL-002", "proposed"));
    p.write("decisions/OVERVIEW.md", "DL-002\n");
    p.write("src/a.py", "# @decision(DL-002)\r\n# batching (DL-002)\tx\r\nDL-0020\n");
    p.write("docs/example.md", "`@decision(DL-002)`\n");
    p.write("src/blob.bin", "\0DL-002");
    p.commitAll("local");
    rename(p, "DL-002", "DL-007");

    const found = findStaleMentions(p.ctx, loadProject(p.ctx), plan, "main");
    expect(found.map(formatStaleMention).sort()).toEqual([
      "docs/example.md\t1\tDL-002\tDL-007\t`@decision(DL-002)`",
      "src/a.py\t2\tDL-002\tDL-007\t# batching (DL-002)\tx",
    ]);
  });

  test("returns nothing for an empty plan and checks the base otherwise", () => {
    const p = branched();
    expect(findStaleMentions(p.ctx, loadProject(p.ctx), "\n", "nope")).toEqual([]);
    expect(() => findStaleMentions(p.ctx, loadProject(p.ctx), plan, "nope")).toThrow(
      "base ref 'nope' not found.",
    );
  });
});
