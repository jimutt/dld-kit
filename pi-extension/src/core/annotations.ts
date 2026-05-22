// Annotation scanner and decision-relevance resolver for a file.
//
// Used by the pre-edit guardrail to compute "which decisions does this
// file touch?" as the union of in-code `@decision(DL-XXX)` annotations
// and frontmatter `references[].path` hits, plus successors for any
// superseded decisions in that union.
//

import type { Decision, DecisionIndex } from "./decision-index.ts";

export const DEFAULT_ANNOTATION_PREFIX = "@decision";

export type RelevantDecisions = {
	fromAnnotations: Decision[];
	fromReferences: Decision[];
	unknownIds: string[];
	successors: Decision[];
};

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract `DL-NNN` IDs from `<prefix>(DL-NNN)` annotations in a string.
 * Order-preserving and deduplicated. Prefix is escaped for regex safety
 * so custom annotation_prefix values with metacharacters work literally.
 */
export function scanAnnotationIds(
	content: string,
	prefix: string = DEFAULT_ANNOTATION_PREFIX,
): string[] {
	const re = new RegExp(`${escapeRegex(prefix)}\\(DL-(\\d+)\\)`, "g");
	const ids = new Set<string>(); // Sets preserve insertion order in JS
	for (const m of content.matchAll(re)) {
		ids.add(`DL-${m[1]}`);
	}
	return [...ids];
}

/**
 * Compute the union of decisions relevant to a file:
 *   - those whose `@decision(DL-NNN)` appear in the file content
 *   - those whose frontmatter `references[].path` matches the file
 *
 * Plus, for any superseded decision in that union, also include its
 * successor (the decision whose `supersedes[]` lists this one) unless
 * the successor is already in the union.
 *
 * `fileContent` may be null when the file does not exist yet (e.g. a
 * `write` to a new path) — in that case only frontmatter references
 * contribute. Catches the proactive case: "there's a proposed decision
 * saying to create this file."
 */
export function computeRelevantDecisions(
	index: DecisionIndex,
	repoRelativePath: string,
	fileContent: string | null,
	prefix: string = DEFAULT_ANNOTATION_PREFIX,
): RelevantDecisions {
	// 1. In-code annotations
	const annotationIds = fileContent ? scanAnnotationIds(fileContent, prefix) : [];
	const fromAnnotations: Decision[] = [];
	const unknownIds: string[] = [];
	for (const id of annotationIds) {
		const d = index.get(id);
		if (d) fromAnnotations.push(d);
		else unknownIds.push(id);
	}

	// 2. Frontmatter references, excluding any already pulled in via annotations
	const annotationIdSet = new Set(fromAnnotations.map((d) => d.id));
	const fromReferences = index
		.byPath(repoRelativePath)
		.filter((d) => !annotationIdSet.has(d.id));

	// 3. Successors for any superseded decisions in the union
	const all = [...fromAnnotations, ...fromReferences];
	const seenIds = new Set<string>([
		...annotationIdSet,
		...fromReferences.map((d) => d.id),
	]);
	const successors: Decision[] = [];
	for (const d of all) {
		if (d.status !== "superseded") continue;
		const succ = index.list().find((x) => x.supersedes.includes(d.id));
		if (succ && !seenIds.has(succ.id)) {
			successors.push(succ);
			seenIds.add(succ.id);
		}
	}

	return { fromAnnotations, fromReferences, unknownIds, successors };
}
