import { afterEach, describe, expect, test } from "bun:test";
import { NAMESPACED_CONFIG, recordText, type TempProject, tempProject } from "../test-helpers.ts";
import { loadProject } from "./project.ts";
import { formatRelated, relatedDecisions } from "./related.ts";

let project: TempProject | undefined;
afterEach(() => {
  project?.cleanup();
  project = undefined;
});

const record = (id: string, status: string, relations: { amends?: string; supersedes?: string }) =>
  recordText(id, status)
    .replace("amends: []", `amends: [${relations.amends ?? ""}]`)
    .replace("supersedes: []", `supersedes: [${relations.supersedes ?? ""}]`);

// @decision(DL-077)
describe("relatedDecisions", () => {
  test("lists both directions across namespaces, by number, malformed IDs last", () => {
    const p = tempProject(NAMESPACED_CONFIG);
    project = p;
    p.write("decisions/records/auth/DL-009.md", record("DL-009", "accepted", { amends: "none" }));
    p.write(
      "decisions/records/billing/DL-010.md",
      record("DL-010", "accepted", { amends: "DL-009" }),
    );
    p.write("decisions/records/DL-100.md", record("DL-100", "accepted", { supersedes: "DL-009" }));
    const related = relatedDecisions(p.ctx, loadProject(p.ctx), "DL-009").map(formatRelated);
    expect(related).toEqual([
      "amended-by\tDL-010\taccepted\tTest decision DL-010",
      "superseded-by\tDL-100\taccepted\tTest decision DL-100",
      "amends\tnone\tmissing\t",
    ]);
  });

  test("is empty for an unrelated decision and fails for an unknown one", () => {
    const p = tempProject();
    project = p;
    p.write("decisions/records/DL-001.md", recordText("DL-001"));
    expect(relatedDecisions(p.ctx, loadProject(p.ctx), "DL-001")).toEqual([]);
    expect(() => relatedDecisions(p.ctx, loadProject(p.ctx), "DL-002")).toThrow(
      "decision DL-002 not found.",
    );
  });
});
