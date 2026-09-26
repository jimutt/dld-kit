import { describe, expect, test } from "bun:test";
import {
  BUNDLED_CLI,
  parseTemplate,
  type Renderers,
  renderBody,
  type ScriptRef,
} from "./template.ts";

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
    [
      "invalid YAML",
      "---\nname: dld-x\ndescription: [x\n---\n",
      ":3: frontmatter is not valid YAML",
    ],
    ["CRLF line endings", "---\r\nname: dld-x\r\n---\r\n", ":1: must use LF line endings"],
    ["unknown field", `${HEADER}user_invocable: true\n---\n`, ":4: unexpected frontmatter line"],
    ["nested value", `${HEADER}compatibility:\n  - bash\n---\n`, ":4: 'compatibility' must be"],
    ["non-boolean internal", `${HEADER}internal: yes please\n---\n`, ":4: 'internal' must be"],
    ["missing description", "---\nname: dld-x\n---\n", ":1: frontmatter needs 'name'"],
    ["mismatched name", "---\ndescription: d\nname: dld-y\n---\n", ":3: name 'dld-y' must match"],
  ])("rejects %s", (_, text, message) => {
    expect(() => parse(text)).toThrow(`${SOURCE}${message}`);
  });
});

const renderers = (overrides: Partial<Renderers> = {}): Renderers => ({
  exists: () => true,
  script: (ref) => `<${ref.skill}|${ref.path}>`,
  dld: () => "DLD",
  dldSetup: () => "SETUP",
  ...overrides,
});

describe("renderBody", () => {
  const template = parse(
    `${HEADER}---\nRun {{script dld-common/scripts/next-id.sh}}\nthen {{script dld-x/scripts/a.sh}}.\nKeep {{project_name}}.\n`,
  );

  test("renders script placeholders and leaves other braces alone", () => {
    expect(renderBody(template, renderers())).toEqual({
      body: "Run <dld-common|scripts/next-id.sh>\nthen <dld-x|scripts/a.sh>.\nKeep {{project_name}}.\n",
      usesDld: false,
    });
  });

  test("renders {{dld}} and {{dld-setup}} and reports that the body runs the CLI", () => {
    const dld = parse(`${HEADER}---\n{{dld-setup}}\n\n{{dld}} next-id\n`);
    expect(renderBody(dld, renderers())).toEqual({
      body: "SETUP\n\nDLD next-id\n",
      usesDld: true,
    });
  });

  test("{{dld}} requires the bundled CLI", () => {
    const dld = parse(`${HEADER}---\n\n{{dld}} next-id\n`);
    const exists = (ref: ScriptRef) => ref.path !== BUNDLED_CLI.path;
    expect(() => renderBody(dld, renderers({ exists }))).toThrow(
      `${SOURCE}:6: {{dld}} needs the bundled CLI at dld-common/scripts/dld.mjs`,
    );
  });

  test("names the template line of a missing file", () => {
    const exists = (ref: ScriptRef) => ref.path !== "scripts/a.sh";
    expect(() => renderBody(template, renderers({ exists }))).toThrow(
      `${SOURCE}:6: no template provides dld-x/scripts/a.sh`,
    );
  });

  test.each([
    ["{{script}}", "malformed placeholder"],
    ["{{ script dld-x/a.sh}}", "malformed placeholder"],
    ["{{script dld-x}}", "malformed placeholder"],
    ["{{script  dld-x/a.sh}}", "malformed placeholder"],
    ["{{scripts dld-x/a.sh}}", "malformed placeholder"],
    ["{{dld }}", "malformed placeholder"],
    ["{{dld-run}}", "malformed placeholder"],
    ["{{script dld-x/../y/a.sh}}", "placeholder path 'dld-x/../y/a.sh' must not contain"],
  ])("rejects %s", (placeholder, message) => {
    const bad = parse(`${HEADER}---\n\n${placeholder}\n`);
    expect(() => renderBody(bad, renderers())).toThrow(`${SOURCE}:6: ${message}`);
  });
});
