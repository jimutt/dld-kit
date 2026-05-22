// Tests for src/core/annotations.ts
//
// Scanner cases are pure-string tests. `computeRelevantDecisions` runs
// against tests/fixtures/sample-project/ via DecisionIndex.

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	computeRelevantDecisions,
	scanAnnotationIds,
} from "../src/core/annotations.ts";
import { loadDecisionIndex, type DecisionIndex } from "../src/core/decision-index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures/sample-project");

async function loadFixture(): Promise<DecisionIndex> {
	const index = await loadDecisionIndex(FIXTURE);
	if (!index) throw new Error("fixture failed to load");
	return index;
}

describe("scanAnnotationIds", () => {
	test("returns empty for a string with no annotations", () => {
		expect(scanAnnotationIds("nothing to see here")).toEqual([]);
	});

	test("extracts a single @decision(DL-001) annotation", () => {
		expect(scanAnnotationIds("// @decision(DL-001)\nfunc()")).toEqual(["DL-001"]);
	});

	test("extracts multiple decisions from `@decision(DL-001) @decision(DL-003)`", () => {
		expect(
			scanAnnotationIds("// @decision(DL-001) @decision(DL-003)"),
		).toEqual(["DL-001", "DL-003"]);
	});

	test("deduplicates repeated IDs (preserves first-occurrence order)", () => {
		expect(
			scanAnnotationIds(
				"// @decision(DL-001)\nfoo\n// @decision(DL-003) @decision(DL-001)",
			),
		).toEqual(["DL-001", "DL-003"]);
	});

	test("honors a custom annotation_prefix", () => {
		expect(scanAnnotationIds("// @dl(DL-005)", "@dl")).toEqual(["DL-005"]);
		// Default prefix shouldn't match a custom-prefix file.
		expect(scanAnnotationIds("// @dl(DL-005)")).toEqual([]);
	});

	test("escapes regex metacharacters in custom prefixes", () => {
		// Prefix containing brackets/dots — must match literally, not as regex.
		expect(scanAnnotationIds("// @dec[ision](DL-001)", "@dec[ision]")).toEqual([
			"DL-001",
		]);
		expect(scanAnnotationIds("// @dec.ision(DL-001)", "@dec.ision")).toEqual([
			"DL-001",
		]);
		// Sanity: the literal `[ision]` should NOT match arbitrary chars when the
		// regex is properly escaped.
		expect(scanAnnotationIds("// @dec_ision(DL-001)", "@dec[ision]")).toEqual([]);
	});

	test("ignores DL-NNN occurrences outside the @decision() form", () => {
		expect(scanAnnotationIds("see DL-001 for context (not annotated)")).toEqual([]);
		expect(scanAnnotationIds("// some prose about DL-001")).toEqual([]);
		// Wrong shape — extra space, missing paren, etc.
		expect(scanAnnotationIds("@decision DL-001")).toEqual([]);
		expect(scanAnnotationIds("@decision(DL-001")).toEqual([]);
	});
});

describe("computeRelevantDecisions", () => {
	test("unions in-code annotations with byPath() references", async () => {
		const index = await loadFixture();
		try {
			// src/auth/login.ts is annotated with @decision(DL-001) and
			// @decision(DL-003) (twice — the dedup happens in scanAnnotationIds).
			// DL-001's frontmatter also references src/auth/login.ts, so byPath
			// would return DL-001 too — but it's already in fromAnnotations and
			// should not be duplicated into fromReferences.
			const content = await readFile(join(FIXTURE, "src/auth/login.ts"), "utf8");
			const result = computeRelevantDecisions(index, "src/auth/login.ts", content);

			expect(result.fromAnnotations.map((d) => d.id).sort()).toEqual([
				"DL-001",
				"DL-003",
			]);
			expect(result.fromReferences).toEqual([]);
			expect(result.unknownIds).toEqual([]);
			expect(result.successors).toEqual([]);
		} finally {
			index.close();
		}
	});

	test("collects unknownIds for annotations not in the index", async () => {
		const index = await loadFixture();
		try {
			const result = computeRelevantDecisions(
				index,
				"src/elsewhere.ts",
				"// @decision(DL-001) @decision(DL-999) @decision(DL-9999)",
			);
			expect(result.fromAnnotations.map((d) => d.id)).toEqual(["DL-001"]);
			expect(result.unknownIds).toEqual(["DL-999", "DL-9999"]);
		} finally {
			index.close();
		}
	});

	test("includes successors for superseded decisions", async () => {
		const index = await loadFixture();
		try {
			// DL-004 is superseded by DL-005. Annotate a file with only DL-004
			// (and use a path that no decision references, so byPath returns []).
			const result = computeRelevantDecisions(
				index,
				"src/elsewhere.ts",
				"// @decision(DL-004)",
			);
			expect(result.fromAnnotations.map((d) => d.id)).toEqual(["DL-004"]);
			expect(result.successors.map((d) => d.id)).toEqual(["DL-005"]);
		} finally {
			index.close();
		}
	});

	test("does not duplicate a successor that's already in fromReferences", async () => {
		const index = await loadFixture();
		try {
			// src/payments/gateway.ts is referenced by DL-002 (accepted),
			// DL-004 (superseded by DL-005), and DL-005 (accepted, supersedes
			// DL-004). DL-005 is already in fromReferences, so it must NOT
			// also appear in successors.
			const result = computeRelevantDecisions(
				index,
				"src/payments/gateway.ts",
				"",
			);
			expect(result.fromReferences.map((d) => d.id).sort()).toEqual([
				"DL-002",
				"DL-004",
				"DL-005",
			]);
			expect(result.successors).toEqual([]);
		} finally {
			index.close();
		}
	});

	test("returns only references when fileContent is null (new file)", async () => {
		const index = await loadFixture();
		try {
			const result = computeRelevantDecisions(
				index,
				"src/payments/gateway.ts",
				null,
			);
			expect(result.fromAnnotations).toEqual([]);
			expect(result.fromReferences.map((d) => d.id).sort()).toEqual([
				"DL-002",
				"DL-004",
				"DL-005",
			]);
		} finally {
			index.close();
		}
	});
});
