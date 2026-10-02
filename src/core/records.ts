import { basename, join } from "node:path";
import { parseDocument } from "yaml";
import type { Context } from "./context.ts";
import { DldError } from "./errors.ts";

export const STATUSES = ["proposed", "accepted", "deprecated", "superseded"] as const;
export type Status = (typeof STATUSES)[number];

export const RECORD_FILE = /^DL-(\d+)\.md$/;
export const DECISION_ID = /^DL-\d+$/;
/** Every decision ID mentioned in a text. */
export const DECISION_MENTION = /DL-\d+/g;

export interface Reference {
  path: string;
  symbol?: string;
}

export interface DecisionRecord {
  id: string;
  title: string;
  status: Status;
  timestamp?: string;
  supersedes: string[];
  amends: string[];
  namespace?: string;
  tags: string[];
  references: Reference[];
}

export function isStatus(value: string): value is Status {
  return STATUSES.some((status) => status === value);
}

/** Paths of every `DL-NNN.md` file under `recordsDir`, at any depth, in a stable order. */
export function listRecordFiles(ctx: Context, recordsDir: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    const entries = ctx.fs.readDir(dir).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory) walk(path);
      else if (entry.isFile && RECORD_FILE.test(entry.name)) found.push(path);
    }
  };
  if (ctx.fs.isDirectory(recordsDir)) walk(recordsDir);
  return found;
}

/** The numeric part of a record file name, e.g. 8 for `.../DL-008.md`. */
export function recordNumber(path: string): number {
  const digits = RECORD_FILE.exec(basename(path))?.[1];
  if (digits === undefined) throw new Error(`not a decision record file: ${path}`);
  return Number.parseInt(digits, 10);
}

export function findRecordFile(ctx: Context, recordsDir: string, id: string): string | undefined {
  return listRecordFiles(ctx, recordsDir).find((path) => basename(path) === `${id}.md`);
}

interface FrontmatterBlock {
  lines: string[];
  /** Index of the opening and closing `---` lines. */
  start: number;
  end: number;
}

const isDelimiter = (line: string) => line === "---" || line === "---\r";

/** Locates the frontmatter between the first two lines that are exactly `---` (LF or CRLF). */
function frontmatterBlock(text: string): FrontmatterBlock | undefined {
  const lines = text.split("\n");
  const start = lines.findIndex(isDelimiter);
  if (start === -1) return undefined;
  const end = lines.findIndex((line, index) => index > start && isDelimiter(line));
  if (end === -1) return undefined;
  return { lines, start, end };
}

/** Everything after the frontmatter's closing `---` line, or the whole text if there is none. */
export function recordBody(text: string): string {
  const block = frontmatterBlock(text);
  return block === undefined ? text : block.lines.slice(block.end + 1).join("\n");
}

/**
 * The text up to and including the frontmatter's closing `---` line and its newline, or
 * undefined if there is no frontmatter. `recordHead(text) + recordBody(text) === text`.
 */
export function recordHead(text: string): string | undefined {
  const block = frontmatterBlock(text);
  if (block === undefined) return undefined;
  return `${block.lines.slice(0, block.end + 1).join("\n")}\n`;
}

// @decision(DL-014)
/** Parses a record's frontmatter. `source` names the record in error messages. */
export function parseRecord(text: string, source: string): DecisionRecord {
  const invalid = (message: string) => new DldError(`${source}: ${message}`);
  const block = frontmatterBlock(text);
  if (block === undefined) throw invalid("no frontmatter between --- lines");

  const frontmatter = block.lines
    .slice(block.start + 1, block.end)
    .map((line) => line.replace(/\r$/, ""));
  const doc = parseDocument(frontmatter.join("\n"), { logLevel: "silent" });
  const problem = doc.errors[0] ?? doc.warnings[0];
  const raw: unknown = problem === undefined ? doc.toJS() : legacyFields(frontmatter);
  if (!isRecord(raw)) throw invalid("frontmatter must be a mapping");

  const string = (key: string): string | undefined => {
    const value = raw[key];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") throw invalid(`'${key}' must be a string`);
    return value;
  };
  const required = (key: string): string => {
    const value = string(key);
    if (value === undefined || value === "") throw invalid(`'${key}' is required`);
    return value;
  };
  const list = (key: string): string[] => {
    const value = raw[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw invalid(`'${key}' must be a list`);
    return value.map((item) => {
      if (typeof item !== "string" && typeof item !== "number") {
        throw invalid(`'${key}' must be a list of strings`);
      }
      return String(item);
    });
  };

  const status = required("status");
  if (!isStatus(status)) throw invalid(`'status' must be one of: ${STATUSES.join(", ")}`);
  const timestamp = string("timestamp");
  const namespace = string("namespace");
  return {
    id: required("id"),
    title: required("title"),
    status,
    ...(timestamp === undefined ? {} : { timestamp }),
    supersedes: list("supersedes"),
    amends: list("amends"),
    ...(namespace === undefined ? {} : { namespace }),
    tags: list("tags"),
    references: references(raw.references, invalid),
  };
}

/**
 * Reads frontmatter that is not valid YAML the way regenerate-index.sh did: the first
 * `<field>:` line per field, surrounding quotes stripped, `[a, b]` lists split on commas.
 * Records written by create-decision.sh with an unescaped `"` in the title need this.
 */
function legacyFields(lines: readonly string[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const lists = new Set(["supersedes", "amends", "tags"]);
  for (const line of lines) {
    const match = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (match === null) continue;
    const [, key = "", rawValue = ""] = match;
    if (key in fields) continue;
    const value = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    fields[key] = lists.has(key)
      ? value
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item !== "")
      : value;
  }
  delete fields.references;
  return fields;
}

function references(value: unknown, invalid: (message: string) => DldError): Reference[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid("'references' must be a list");
  return value.map((item) => {
    if (!isRecord(item) || typeof item.path !== "string") {
      throw invalid("'references' entries must have a 'path'");
    }
    return typeof item.symbol === "string"
      ? { path: item.path, symbol: item.symbol }
      : { path: item.path };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// @decision(DL-014)
/** Replaces the `status:` line in the frontmatter, leaving every other byte unchanged. */
export function setStatus(text: string, status: Status, source: string): string {
  const block = frontmatterBlock(text);
  if (block === undefined) throw new DldError(`${source}: no frontmatter between --- lines`);
  const { lines, start, end } = block;
  let replaced = false;
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (line?.startsWith("status:")) {
      lines[i] = `status: ${status}${line.endsWith("\r") ? "\r" : ""}`;
      replaced = true;
    }
  }
  if (!replaced) throw new DldError(`${source}: frontmatter has no 'status' field`);
  return lines.join("\n");
}

// @decision(DL-014) @decision(DL-029)
/** Rewrites a frontmatter `id: <oldId>` line to `id: <newId>`, leaving every other byte unchanged. */
export function setId(text: string, oldId: string, newId: string): string {
  const block = frontmatterBlock(text);
  if (block === undefined) return text;
  const { lines, start, end } = block;
  const idLine = new RegExp(`^id:[ \\t]*${oldId}(\\r?)$`);
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (line !== undefined && idLine.test(line)) lines[i] = line.replace(idLine, `id: ${newId}$1`);
  }
  return lines.join("\n");
}

export interface NewRecord {
  id: string;
  title: string;
  timestamp: string;
  namespace?: string;
  /** Comma-separated lists, written inside `[...]` as given. */
  tags: string;
  supersedes: string;
  amends: string;
  body: string;
}

const YAML_ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

/** A double-quoted YAML scalar; backslashes, quotes and control characters are escaped. */
function quoted(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
  const escaped = value.replace(/[\\"\x00-\x1f\x7f]/g, (char) => {
    return YAML_ESCAPES[char] ?? `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`;
  });
  return `"${escaped}"`;
}

// @decision(DL-014)
/** Renders a new record in the same layout as create-decision.sh. */
export function renderNewRecord(record: NewRecord): string {
  const lines = [
    "---",
    `id: ${record.id}`,
    `title: ${quoted(record.title)}`,
    `timestamp: ${record.timestamp}`,
    "status: proposed",
    `supersedes: [${record.supersedes}]`,
    `amends: [${record.amends}]`,
    ...(record.namespace === undefined ? [] : [`namespace: ${record.namespace}`]),
    `tags: [${record.tags}]`,
    "references: []",
    "---",
    "",
  ];
  const body = record.body.replace(/\n+$/, "");
  if (body !== "") lines.push(body);
  return `${lines.join("\n")}\n`;
}

/** `YYYY-MM-DDTHH:MM:SSZ` in UTC, as `date -u +"%Y-%m-%dT%H:%M:%SZ"` prints it. */
export function formatTimestamp(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}
