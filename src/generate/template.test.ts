import { describe, expect, test } from "bun:test";
import { parseTemplate, renderBody } from "./template.ts";

const SOURCE = "templates/skills/dld-x/SKILL.md";
const parse = (text: string) => parseTemplate(text, "dld-x", SOURCE);
const HEADER = "---\nname: dld-x\ndescription: Does x — see `@decision` notes.\n";

describe("parseTemplate", () => {
  test("keeps each field's line as written and splits off the body", () => {
    const template = parse(`${HEADER}compatibility: "Requires bash"\ninternal: true\n---\n\n# X\n`);
    expect(template.lines).toEqual({
      name: "name: dld-x",
      description: "description: Does x — see `@decision` notes.",
      compatibility: 'compatibility: "Requires bash"',
    });
    expect(template.internal).toBe(true);
    expect(template.body).toBe("\n# X\n");
    expect(template.bodyLine).toBe(7);
  });

  test.each([
    ["no frontmatter", "# X\n", ":1: must start with a --- frontmatter line"],
    ["unclosed frontmatter", "---\nname: dld-x\n", ":1: frontmatter has no closing --- line"],
    ["invalid YAML", "---\nname: [x\n---\n", ":2: frontmatter is not valid YAML"],
    ["unknown field", `${HEADER}user_invocable: true\n---\n`, ":4: unexpected frontmatter line"],
    ["nested value", `${HEADER}compatibility:\n  - bash\n---\n`, ":4: 'compatibility' must be"],
    ["non-boolean internal", `${HEADER}internal: yes please\n---\n`, ":4: 'internal' must be"],
    ["missing description", "---\nname: dld-x\n---\n", ":1: frontmatter needs 'name'"],
    ["mismatched name", "---\nname: dld-y\ndescription: d\n---\n", ":2: name 'dld-y' must match"],
  ])("rejects %s", (_, text, message) => {
    expect(() => parse(text)).toThrow(`${SOURCE}${message}`);
  });
});

describe("renderBody", () => {
  const template = parse(
    `${HEADER}---\nRun {{script dld-common/scripts/next-id.sh}}\nthen {{script dld-x/scripts/a.sh}}.\nKeep {{project_name}}.\n`,
  );

  test("renders script placeholders and leaves other braces alone", () => {
    const body = renderBody(
      template,
      () => true,
      (ref) => `<${ref.skill}|${ref.path}>`,
    );
    expect(body).toBe(
      "Run <dld-common|scripts/next-id.sh>\nthen <dld-x|scripts/a.sh>.\nKeep {{project_name}}.\n",
    );
  });

  test("names the template line of a missing file", () => {
    const exists = (ref: { path: string }) => ref.path !== "scripts/a.sh";
    expect(() => renderBody(template, exists, () => "")).toThrow(
      `${SOURCE}:6: no template provides dld-x/scripts/a.sh`,
    );
  });

  test.each([
    ["{{script}}", "malformed placeholder"],
    ["{{ script dld-x/a.sh}}", "malformed placeholder"],
    ["{{script dld-x}}", "malformed placeholder"],
    ["{{script  dld-x/a.sh}}", "malformed placeholder"],
    ["{{scripts dld-x/a.sh}}", "malformed placeholder"],
    ["{{script dld-x/../y/a.sh}}", "placeholder path 'dld-x/../y/a.sh' must not contain"],
  ])("rejects %s", (placeholder, message) => {
    const bad = parse(`${HEADER}---\n\n${placeholder}\n`);
    expect(() =>
      renderBody(
        bad,
        () => true,
        () => "",
      ),
    ).toThrow(`${SOURCE}:6: ${message}`);
  });
});
