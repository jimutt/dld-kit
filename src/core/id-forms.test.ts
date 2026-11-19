import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type BranchedProject,
  branchedProject,
  FIXED_NOW,
  FLAT_CONFIG,
  NAMESPACED_CONFIG,
  recordText,
  type TempProject,
  tempProject,
} from "../test-helpers.ts";
import { formatNearMiss, type NearMiss, scanAnnotations } from "./annotations.ts";
import { findMissingAmends } from "./audit.ts";
import { integratedRecords } from "./decision-edits.ts";
import { createDecision } from "./decisions.ts";
import { timestampId } from "./ids.ts";
import { collectIndexRows, renderIndex } from "./index-file.ts";
import { mentionTiers, statedRelations } from "./mentions.ts";
import { loadProject } from "./project.ts";
import { listProposed } from "./proposed.ts";
import {
  duplicateRecordFiles,
  findRecordFile,
  listRecordFiles,
  reservedRecordFiles,
} from "./records.ts";
import { findCollisions, formatRename, listTakenIds, planRenames } from "./reindex.ts";
import { relatedDecisions } from "./related.ts";
import { findStaleMentions, renameDecision } from "./rename.ts";
import { parseRenamePlan } from "./rename-plan.ts";
import { collectActiveDecisions, detectSnapshotChanges, updateSnapshotState } from "./snapshot.ts";

// Both ID forms (DL-092) through the modules that read, order and rewrite IDs.

const T1 = "DL-T1k3m9z2p7xq4";
const T2 = "DL-T1k3m9z2p7xq5";
const RECORDS = "decisions/records";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

function flat(config = FLAT_CONFIG): TempProject {
  project = tempProject(config);
  return project;
}

function branched(): BranchedProject {
  const p = branchedProject();
  project = p;
  return p;
}

const read = (p: TempProject, path: string) => readFileSync(join(p.root, path), "utf8");
const input = { title: "Use X", tags: "", supersedes: "", amends: "", body: "Body" };
/** Record text whose `amends` lists `ids`. */
const amending = (id: string, status: string, ...ids: string[]) =>
  recordText(id, status).replace("amends: []", `amends: [${ids.join(", ")}]`);

// @decision(DL-094)
describe("annotations", () => {
  test("a timestamp ID is an annotation only in its canonical spelling", () => {
    const p = flat();
    p.write(
      "src/a.ts",
      [
        `// @decision(${T1}) @decision(DL-007)`,
        "// @decision(DL-T1K3M9Z2P7XQ4) @decision( DL-T1k3m9z2p7xq4 ) @decision(DL-T1k3m9)",
        `// @decision(${T1}0) @decision(DL-TBD) @decision(DL-Table)`,
      ].join("\n"),
    );
    const nearMisses: NearMiss[] = [];
    const options = { root: p.root, decisionsDir: join(p.root, "decisions"), prefix: "@decision" };
    const found = scanAnnotations(p.ctx, options, undefined, (miss) => nearMisses.push(miss));
    expect(found.map(({ id }) => id)).toEqual([T1, "DL-007"]);
    expect(nearMisses.map(formatNearMiss)).toEqual([
      "src/a.ts:2: not an annotation: @decision(DL-T1K3M9Z2P7XQ4)",
      "src/a.ts:2: not an annotation: @decision( DL-T1k3m9z2p7xq4 )",
      "src/a.ts:2: not an annotation: @decision(DL-T1k3m9)",
      `src/a.ts:3: not an annotation: @decision(${T1}0)`,
    ]);
  });
});

// @decision(DL-094)
describe("mentions", () => {
  test("a timestamp ID is a mention, a subject and the object of a relation", () => {
    expect(statedRelations(`This amends ${T1} and DL-005.`)).toEqual([
      { id: T1, relation: "amends" },
      { id: "DL-005", relation: "amends" },
    ]);
    expect(statedRelations(`${T1} supersedes DL-005.`)).toEqual([]);
    expect(statedRelations(`This amends DL-003. ${T2}'s rule supersedes ${T1}.`)).toEqual([
      { id: "DL-003", relation: "amends" },
    ]);
    expect([...mentionTiers(`## Decision\nThis replaces ${T1}.\n\nSee ${T2}x and ${T2}.`)]).toEqual(
      [
        [T1, "cue"],
        [T2, "mention"],
      ],
    );
  });

  test("find-missing-amends reports them in ID order", () => {
    const p = flat();
    p.write(`${RECORDS}/DL-001.md`, recordText("DL-001"));
    p.write(`${RECORDS}/${T1}.md`, recordText(T1));
    p.write(
      `${RECORDS}/${T2}.md`,
      `${recordText(T2)}\nThis amends ${T1}. It also amends DL-001. See DL-1000.\n`,
    );
    expect(findMissingAmends(p.ctx, loadProject(p.ctx), { all: true, mentions: true })).toEqual([
      { source: T2, referenced: "DL-001", tier: "explicit" },
      { source: T2, referenced: "DL-1000", tier: "mention" },
      { source: T2, referenced: T1, tier: "explicit" },
    ]);
  });
});

// @decision(DL-092) @decision(DL-096)
describe("createDecision", () => {
  test("accepts a canonical timestamp ID and names the respelling of another", () => {
    const p = flat();
    const created = createDecision(p.ctx, loadProject(p.ctx), { ...input, id: T1 });
    expect(created).toBe(join(p.root, RECORDS, `${T1}.md`));
    expect(read(p, `${RECORDS}/${T1}.md`)).toContain(`id: ${T1}\n`);
    expect(() =>
      createDecision(p.ctx, loadProject(p.ctx), { ...input, id: "DL-T1K3M9Z2P7XQ5" }),
    ).toThrow(`decision ID 'DL-T1K3M9Z2P7XQ5' is not canonical; use ${T2}.`);
    expect(() => createDecision(p.ctx, loadProject(p.ctx), { ...input, id: "DL-Tbd" })).toThrow(
      "invalid decision ID 'DL-Tbd'; expected DL-<digits>, e.g. DL-001, or a timestamp ID.",
    );
  });

  test("an ID exists by number for sequential IDs and by text for timestamp IDs", () => {
    const p = flat(NAMESPACED_CONFIG);
    p.write(`${RECORDS}/auth/${T1}.md`, recordText(T1));
    p.write(`${RECORDS}/auth/DL-07.md`, recordText("DL-07"));
    const create = (id: string) => createDecision(p.ctx, loadProject(p.ctx), { ...input, id });
    expect(() => create(T1)).toThrow(`decision ${T1} already exists: ${RECORDS}/auth/${T1}.md`);
    expect(() => create("DL-007")).toThrow("decision DL-007 already exists");
    expect(create(T2)).toBe(join(p.root, RECORDS, `${T2}.md`));
  });
});

// @decision(DL-096) @decision(DL-099)
describe("record files", () => {
  test("duplicates are grouped per decision, in ID order", () => {
    const p = flat(NAMESPACED_CONFIG);
    for (const path of [`auth/${T1}.md`, `billing/${T1}.md`, `${T2}.md`, "DL-02.md", "DL-002.md"]) {
      p.write(`${RECORDS}/${path}`, "");
    }
    const records = join(p.root, RECORDS);
    expect(duplicateRecordFiles(p.ctx, records)).toEqual([
      [join(records, "DL-002.md"), join(records, "DL-02.md")],
      [join(records, `auth/${T1}.md`), join(records, `billing/${T1}.md`)],
    ]);
    expect(() => findRecordFile(p.ctx, records, T1, p.root)).toThrow("is in more than one file");
    expect(findRecordFile(p.ctx, records, T2)).toBe(join(records, `${T2}.md`));
  });

  test("a reserved <id>--<text>.md name is not a record", () => {
    const p = flat(NAMESPACED_CONFIG);
    for (const path of [`${T1}.md`, `${T1}--retry.md`, "auth/DL-002--x.md", "DL-003-x.md"]) {
      p.write(`${RECORDS}/${path}`, "");
    }
    const records = join(p.root, RECORDS);
    expect(listRecordFiles(p.ctx, records)).toEqual([join(records, `${T1}.md`)]);
    expect(reservedRecordFiles(p.ctx, records)).toEqual([
      join(records, `${T1}--retry.md`),
      join(records, "auth/DL-002--x.md"),
    ]);
    expect(reservedRecordFiles(p.ctx, join(p.root, "missing"))).toEqual([]);
  });
});

// @decision(DL-093)
describe("order across forms", () => {
  function mixed(): TempProject {
    const p = flat();
    p.write(`${RECORDS}/${T2}.md`, amending(T2, "proposed", "DL-1000"));
    p.write(`${RECORDS}/${T1}.md`, recordText(T1, "proposed"));
    p.write(`${RECORDS}/DL-1000.md`, recordText("DL-1000", "proposed"));
    p.write(`${RECORDS}/DL-999.md`, amending("DL-999", "proposed", T2));
    return p;
  }
  const idsIn = (text: string) => [...text.matchAll(/^id: (.*)$/gm)].map((match) => match[1]);

  test("the index lists timestamp IDs first, newest on top, then sequential IDs", () => {
    const p = mixed();
    const { paths } = loadProject(p.ctx);
    const rows = renderIndex(collectIndexRows(p.ctx, paths), "flat").split("\n").slice(4, 8);
    expect(rows.map((row) => row.split(" | ")[0])).toEqual([
      `| ${T2}`,
      `| ${T1}`,
      "| DL-1000",
      "| DL-999",
    ]);
  });

  test("the snapshot input, proposed list and related decisions ascend", () => {
    const p = mixed();
    const loaded = loadProject(p.ctx);
    expect(idsIn(collectActiveDecisions(p.ctx, loaded, { includeProposed: true }))).toEqual([
      "DL-999",
      "DL-1000",
      T1,
      T2,
    ]);
    expect(listProposed(p.ctx, loaded, undefined).map(({ id }) => id)).toEqual([
      "DL-999",
      "DL-1000",
      T1,
      T2,
    ]);
    p.write(`${RECORDS}/${T1}.md`, amending(T1, "accepted", T2));
    expect(relatedDecisions(p.ctx, loaded, T2).map(({ relation, id }) => [relation, id])).toEqual([
      ["amended-by", "DL-999"],
      ["amends", "DL-1000"],
      ["amended-by", T1],
    ]);
  });
});

// @decision(DL-094) @decision(DL-096)
describe("reindex", () => {
  test("a timestamp ID taken on the base collides and is renamed to the next sequential ID", () => {
    const p = branched();
    p.onMain("land", () => p.write(`${RECORDS}/${T1}.md`, recordText(T1)));
    p.write(`${RECORDS}/${T1}.md`, recordText(T1, "proposed"));
    p.write(`${RECORDS}/${T2}.md`, recordText(T2, "proposed"));
    p.commitAll("local");
    const loaded = loadProject(p.ctx);
    expect(listTakenIds(p.ctx, loaded, "main").ids).toEqual(["DL-001", T1]);
    expect(findCollisions(p.ctx, loaded, "main").collisions).toEqual([
      { path: `${RECORDS}/${T1}.md`, id: T1 },
    ]);
    expect(planRenames(p.ctx, loaded, "main").renames.map(formatRename)).toEqual([
      `${RECORDS}/${T1}.md\t${T1}\tDL-002`,
    ]);
  });

  // @decision(DL-096)
  test("a timestamp project renames every collision to a new timestamp ID, in ID order", () => {
    const p = branchedProject(`${FLAT_CONFIG}id_format: timestamp\n`, {
      randomBytes: (count) => new Uint8Array(count),
    });
    project = p;
    p.onMain("land", () => {
      p.write(`${RECORDS}/DL-002.md`, recordText("DL-002"));
      p.write(`${RECORDS}/${T1}.md`, recordText(T1));
    });
    p.write(`${RECORDS}/${T1}.md`, recordText(T1, "proposed"));
    p.write(`${RECORDS}/DL-002.md`, recordText("DL-002", "proposed"));
    p.commitAll("local");
    const now = Math.floor(FIXED_NOW.getTime() / 1000);
    expect(planRenames(p.ctx, loadProject(p.ctx), "main").renames.map(formatRename)).toEqual([
      `${RECORDS}/DL-002.md\tDL-002\t${timestampId(now, 0)}`,
      `${RECORDS}/${T1}.md\t${T1}\t${timestampId(now + 1, 0)}`,
    ]);
  });

  test("a rename between forms rewrites the record, references and annotations", () => {
    const p = branched();
    p.write(
      `${RECORDS}/DL-002.md`,
      recordText("DL-002", "proposed").replace("## Context", `About DL-002, not ${T1}.`),
    );
    p.write(`${RECORDS}/DL-003.md`, amending("DL-003", "proposed", "DL-002"));
    p.write("src/a.py", `# @decision(DL-002)\n# see DL-002, ${T2}0\n`);
    p.commitAll("local");
    const loaded = loadProject(p.ctx);
    const rename = (oldId: string, newId: string) =>
      renameDecision(p.ctx, loaded, { path: `${RECORDS}/${oldId}.md`, oldId, newId }, "main");

    expect(rename("DL-002", T2)).toBe(`${RECORDS}/${T2}.md`);
    expect(read(p, `${RECORDS}/${T2}.md`)).toContain(`id: ${T2}\n`);
    expect(read(p, `${RECORDS}/${T2}.md`)).toContain(`About ${T2}, not ${T1}.`);
    expect(read(p, `${RECORDS}/DL-003.md`)).toContain(`amends: [${T2}]`);
    expect(read(p, "src/a.py")).toBe(`# @decision(${T2})\n# see DL-002, ${T2}0\n`);
    const plan = `${RECORDS}/DL-002.md\tDL-002\t${T2}\n`;
    expect(findStaleMentions(p.ctx, loaded, plan, "main").map(({ line }) => line)).toEqual([2]);

    p.commitAll("renamed");
    p.write(`${RECORDS}/DL-003.md`, amending("DL-003", "proposed", T2, `${T2}0`));
    expect(rename(T2, "DL-004")).toBe(`${RECORDS}/DL-004.md`);
    expect(read(p, `${RECORDS}/DL-003.md`)).toContain(`amends: [DL-004, ${T2}0]`);
    expect(read(p, "src/a.py")).toBe(`# @decision(DL-004)\n# see DL-002, ${T2}0\n`);
  });

  test("a rename plan takes a canonical timestamp ID and names the respelling of another", () => {
    const p = flat();
    const { paths } = loadProject(p.ctx);
    const line = (oldId: string, newId: string) => `${RECORDS}/${oldId}.md\t${oldId}\t${newId}`;
    expect(parseRenamePlan(paths, `${line("DL-002", T1)}\n${line(T2, "DL-003")}\n`)).toEqual([
      { path: `${RECORDS}/DL-002.md`, oldId: "DL-002", newId: T1 },
      { path: `${RECORDS}/${T2}.md`, oldId: T2, newId: "DL-003" },
    ]);
    expect(() => parseRenamePlan(paths, line("DL-002", "DL-T1K3M9Z2P7XQ4"))).toThrow(
      `new ID 'DL-T1K3M9Z2P7XQ4' is not canonical; use ${T1}.`,
    );
    expect(() => parseRenamePlan(paths, line("DL-002", "dl-5"))).toThrow(
      "new ID 'dl-5' is not canonical; use DL-005.",
    );
    expect(() => parseRenamePlan(paths, line("DL-T1K3M9Z2P7XQ4", "DL-002"))).toThrow(
      "IDs must be decision IDs: DL-<digits> or a timestamp ID.",
    );
  });
});

test("a timestamp record on the base branch is integrated", () => {
  const p = branched();
  p.write(`${RECORDS}/${T1}.md`, recordText(T1));
  p.write(`${RECORDS}/${T1}--slug.md`, recordText(T1));
  p.commitAll("land");
  p.git("branch", "-f", "main");
  const { paths } = loadProject(p.ctx);
  expect([...integratedRecords(p.ctx, paths, "main").byId.keys()]).toEqual(["DL-001", T1]);
});

describe("snapshot", () => {
  test("a sequential record at the watermark in another spelling is modified, not new", () => {
    const p = branched();
    p.write("decisions/OVERVIEW.md", "x");
    p.write(`${RECORDS}/DL-05.md`, recordText("DL-05"));
    p.commitAll("snapshot");
    const loaded = loadProject(p.ctx);
    expect(updateSnapshotState(p.ctx, loaded, []).highest).toBe(5);
    p.write(`${RECORDS}/DL-05.md`, `${recordText("DL-05")}more\n`);
    p.commitAll("edit");
    const changes = detectSnapshotChanges(p.ctx, loaded);
    expect(changes).toMatchObject({ newDecisions: [], modifiedDecisions: ["DL-005"] });
  });

  test("timestamp records are new until the watermark can hold them", () => {
    const p = branched();
    p.write("decisions/OVERVIEW.md", "x");
    p.write(`${RECORDS}/${T1}.md`, recordText(T1));
    p.commitAll("snapshot");
    const loaded = loadProject(p.ctx);
    expect(updateSnapshotState(p.ctx, loaded, []).highest).toBe(1);
    expect(detectSnapshotChanges(p.ctx, loaded)).toEqual({
      mode: "incremental",
      newDecisions: [T1],
      modifiedDecisions: [],
      commitRange: "",
    });
  });
});
