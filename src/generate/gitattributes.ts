import { join } from "node:path";
import type { Context } from "../core/context.ts";
import { writeFileAtomic } from "../core/files.ts";

export const GITATTRIBUTES = ".gitattributes";
export const INDEX_MERGE_COMMENT =
  "# dld-kit: keep both sides' rows when merging the decision index";

export interface AttributesPlan {
  /** The new `.gitattributes` content, or undefined when nothing needs writing. */
  content?: string;
  /** Whether the plan creates the file. */
  creates?: boolean;
  warnings: string[];
}

/** A merge setting, set or unset (`merge=union`, `-merge`, `!merge`), or `binary`, which unsets it. */
const MERGE_ATTRIBUTE = /^([-!]?merge(=|$)|binary$)/;

/** Characters that make a path mean something else as a .gitattributes pattern. */
const SPECIAL = /[\s"\\*?[\]]|^[!#]|(^|\/)\.\.(\/|$)/;

/** A pattern as git reads it: a C-style quoted pattern is unquoted. */
function unquote(pattern: string): string {
  return pattern.length > 1 && pattern.startsWith('"') && pattern.endsWith('"')
    ? pattern.slice(1, -1).replace(/\\(.)/g, "$1")
    : pattern;
}

// @decision(DL-075)
/**
 * Plans the `.gitattributes` line that merges INDEX.md with git's union driver. `index` is the
 * index's root-relative, `/`-separated path. A line that already sets a merge attribute for that
 * path wins, whoever wrote it, and no other line is ever changed.
 */
export function planIndexMergeAttribute(ctx: Context, root: string, index: string): AttributesPlan {
  const path = join(root, GITATTRIBUTES);
  const wanted = `/${index} merge=union`;
  if (SPECIAL.test(index)) {
    return {
      warnings: [
        `the decision index ${index} cannot be named in ${GITATTRIBUTES} as a plain pattern, so dld-kit does not add its merge=union line. Add a line that matches it yourself, or two branches that add decisions will conflict on it.`,
      ],
    };
  }
  if (ctx.fs.lexists(path) && !ctx.fs.isRegularFile(path)) {
    return {
      warnings: [
        `${GITATTRIBUTES} is not a regular file, so dld-kit does not edit it. Add this line to it yourself: ${wanted}`,
      ],
    };
  }
  const text = ctx.fs.lexists(path) ? ctx.fs.readFile(path) : "";
  const lines = text.split(/\r?\n/);
  const warnings: string[] = [];
  let set = false;
  lines.forEach((line, index_) => {
    const [raw, ...attributes] = line.trim().split(/\s+/);
    if (raw === undefined || raw === "" || raw.startsWith("#")) return;
    const pattern = unquote(raw);
    const forIndex = pattern === `/${index}` || pattern === index;
    if (forIndex && attributes.some((attribute) => MERGE_ATTRIBUTE.test(attribute))) set = true;
    if (!forIndex && lines[index_ - 1] === INDEX_MERGE_COMMENT) {
      warnings.push(
        `${GITATTRIBUTES} still sets a merge driver for ${pattern}, an earlier decisions directory. Remove that line if the index is no longer there.`,
      );
    }
  });
  if (set) return { warnings };
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const separator = text === "" ? "" : text.endsWith("\n") ? eol : eol + eol;
  return {
    content: `${text}${separator}${INDEX_MERGE_COMMENT}${eol}${wanted}${eol}`,
    creates: !ctx.fs.lexists(path),
    warnings,
  };
}

/** Writes a planned `.gitattributes`; returns whether it wrote one. */
export function applyIndexMergeAttribute(
  ctx: Context,
  root: string,
  plan: AttributesPlan,
): boolean {
  if (plan.content === undefined) return false;
  writeFileAtomic(ctx, join(root, GITATTRIBUTES), plan.content);
  return true;
}
