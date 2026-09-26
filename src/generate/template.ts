import { parseDocument } from "yaml";
import { DldError } from "../core/errors.ts";

/** Frontmatter fields a template may set, in output order. */
export const TEMPLATE_FIELDS = ["name", "description", "compatibility", "internal"] as const;
type TemplateField = (typeof TEMPLATE_FIELDS)[number];

export interface SkillTemplate {
  /** The skill's directory name, which its `name` must match. */
  skill: string;
  /** Source path for error messages and the generated-file notice, e.g. `templates/skills/x/SKILL.md`. */
  source: string;
  /** Each field's frontmatter line exactly as written, so output keeps its formatting. */
  lines: Partial<Record<Exclude<TemplateField, "internal">, string>>;
  internal: boolean;
  /** Everything after the closing `---` line. */
  body: string;
  /** 1-based line number of the body's first line in the template. */
  bodyLine: number;
}

// @decision(DL-031)
/** Parses a SKILL.md template: single-line `key: value` frontmatter, then a Markdown body. */
export function parseTemplate(text: string, skill: string, source: string): SkillTemplate {
  const fail = (line: number, message: string) => new DldError(`${source}:${line}: ${message}`);
  if (text.includes("\r")) throw fail(1, "must use LF line endings, not CRLF");
  const lines = text.split("\n");
  if (lines[0] !== "---") throw fail(1, "must start with a --- frontmatter line");
  const end = lines.indexOf("---", 1);
  if (end === -1) throw fail(1, "frontmatter has no closing --- line");

  const doc = parseDocument(lines.slice(1, end).join("\n"), { logLevel: "silent" });
  const problem = doc.errors[0];
  if (problem !== undefined) {
    const line = 1 + (problem.linePos?.[0].line ?? 1);
    throw fail(line, `frontmatter is not valid YAML: ${problem.message.split("\n", 1)[0]}`);
  }
  const values: unknown = doc.toJS();

  const raw: SkillTemplate["lines"] = {};
  let internal = false;
  for (let i = 1; i < end; i++) {
    const line = lines[i] ?? "";
    const key = /^([a-z_]+):/.exec(line)?.[1];
    if (key === undefined || !isField(key)) {
      throw fail(
        i + 1,
        `unexpected frontmatter line; allowed fields: ${TEMPLATE_FIELDS.join(", ")}`,
      );
    }
    const value = isRecord(values) ? values[key] : undefined;
    if (key === "internal") {
      if (typeof value !== "boolean") throw fail(i + 1, "'internal' must be true or false");
      internal = value;
    } else {
      if (typeof value !== "string" || value === "") {
        throw fail(i + 1, `'${key}' must be a single-line string`);
      }
      raw[key] = line;
    }
  }
  if (raw.name === undefined || raw.description === undefined) {
    throw fail(1, "frontmatter needs 'name' and 'description'");
  }
  const name = isRecord(values) ? values.name : undefined;
  if (name !== skill) {
    const line = lines.findIndex((l, i) => i > 0 && i < end && l.startsWith("name:")) + 1;
    throw fail(line, `name '${String(name)}' must match the directory '${skill}'`);
  }
  return {
    skill,
    source,
    lines: raw,
    internal,
    body: lines.slice(end + 1).join("\n"),
    bodyLine: end + 2,
  };
}

/** A `{{script <skill>/<path>}}` reference. */
export interface ScriptRef {
  skill: string;
  path: string;
}

/** How each placeholder renders, and which files exist for `{{script}}` to reference. */
export interface Renderers {
  exists(ref: ScriptRef): boolean;
  script(ref: ScriptRef): string;
  /** `{{dld}}`: the command prefix that runs the bundled CLI. */
  dld(): string;
  /** `{{dld-setup}}`: the paragraph telling the agent what the commands need. */
  dldSetup(): string;
}

/** The bundled CLI every `{{dld}}` placeholder relies on (DL-035). */
export const BUNDLED_CLI: ScriptRef = { skill: "dld-common", path: "scripts/dld.mjs" };

const PLACEHOLDER_START = /\{\{\s*(?:script|dld)/g;
const SCRIPT = /\{\{script ([a-z0-9-]+)\/([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)\}\}/y;
const DLD = /\{\{dld(-setup)?\}\}/y;

// @decision(DL-031) @decision(DL-036)
/**
 * Replaces every `{{script <skill>/<path>}}`, `{{dld}}` and `{{dld-setup}}` in the body, and
 * reports whether the body runs the CLI. Other `{{...}}` text is left as is. A malformed
 * placeholder, or one naming a file that does not exist, is an error.
 */
export function renderBody(
  template: SkillTemplate,
  renderers: Renderers,
): { body: string; usesDld: boolean } {
  const { body } = template;
  let out = "";
  let last = 0;
  let usesDld = false;
  for (const start of body.matchAll(PLACEHOLDER_START)) {
    const at = start.index;
    const line = template.bodyLine + (body.slice(0, at).match(/\n/g)?.length ?? 0);
    const fail = (message: string) => new DldError(`${template.source}:${line}: ${message}`);
    DLD.lastIndex = at;
    const dld = DLD.exec(body);
    if (dld !== null) {
      if (!renderers.exists(BUNDLED_CLI)) {
        throw fail(`{{dld}} needs the bundled CLI at ${BUNDLED_CLI.skill}/${BUNDLED_CLI.path}`);
      }
      usesDld = true;
      out += body.slice(last, at) + (dld[1] === undefined ? renderers.dld() : renderers.dldSetup());
      last = at + dld[0].length;
      continue;
    }
    SCRIPT.lastIndex = at;
    const [text, skill, path] = SCRIPT.exec(body) ?? [];
    if (text === undefined || skill === undefined || path === undefined) {
      throw fail(
        "malformed placeholder; expected {{script <skill>/<path>}}, {{dld}} or {{dld-setup}}",
      );
    }
    if (path.split("/").some((segment) => segment === "." || segment === "..")) {
      throw fail(`placeholder path '${skill}/${path}' must not contain '.' or '..'`);
    }
    const ref = { skill, path };
    if (!renderers.exists(ref)) throw fail(`no template provides ${skill}/${path}`);
    out += body.slice(last, at) + renderers.script(ref);
    last = at + text.length;
  }
  return { body: out + body.slice(last), usesDld };
}

function isField(key: string): key is TemplateField {
  return TEMPLATE_FIELDS.some((field) => field === key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
