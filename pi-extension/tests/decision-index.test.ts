// Tests for src/core/decision-index.ts
//
// Most cases run against tests/fixtures/sample-project/ — a hand-crafted
// flat DLD project with 5 decisions covering accepted, proposed,
// superseded-with-successor, and amends-chain edge cases.
//
// The fs.watch test sets up a fresh tmpdir project so the fixture stays
// read-only.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDecisionIndex, type IndexChange } from "../src/core/decision-index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures/sample-project");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("loadDecisionIndex", () => {
	test("returns null for a directory without dld.config.yaml (silent no-op)", async () => {
		const empty = mkdtempSync(join(tmpdir(), "dld-empty-"));
		try {
			const index = await loadDecisionIndex(empty);
			expect(index).toBeNull();
		} finally {
			rmSync(empty, { recursive: true, force: true });
		}
	});

	test("loads decisions from tests/fixtures/sample-project", async () => {
		const index = await loadDecisionIndex(FIXTURE);
		expect(index).not.toBeNull();
		try {
			const ids = index!.list()
				.map((d) => d.id)
				.sort();
			expect(ids).toEqual(["DL-001", "DL-002", "DL-003", "DL-004", "DL-005"]);
		} finally {
			index?.close();
		}
	});

	test("recognizes flat mode (no namespace inferred)", async () => {
		const index = await loadDecisionIndex(FIXTURE);
		try {
			for (const d of index!.list()) {
				expect(d.namespace).toBeUndefined();
			}
		} finally {
			index?.close();
		}
	});

	test("parses status, tags, timestamp, supersedes, amends, references", async () => {
		const index = await loadDecisionIndex(FIXTURE);
		try {
			const dl5 = index!.get("DL-005");
			expect(dl5).toBeDefined();
			expect(dl5!.numericId).toBe(5);
			expect(dl5!.status).toBe("accepted");
			expect(dl5!.tags).toEqual(["payments", "resilience"]);
			// Timestamps canonicalize through Date.toISOString() regardless of
			// how they were written in YAML — see the parser comment.
			expect(dl5!.timestamp).toBe("2026-03-04T10:00:00.000Z");
			expect(dl5!.supersedes).toEqual(["DL-004"]);
			expect(dl5!.amends).toEqual(["DL-002"]);
			expect(dl5!.references.map((r) => r.path)).toEqual([
				"src/payments/gateway.ts",
				"src/payments/retry.ts",
			]);
			expect(dl5!.references[0].symbol).toBe("callGateway");
			expect(dl5!.body ?? "").toContain("Exponential backoff");

			const dl4 = index!.get("DL-004");
			expect(dl4!.status).toBe("superseded");
			expect(dl4!.supersedes).toEqual(["DL-002"]);
		} finally {
			index?.close();
		}
	});

	test("byPath() returns decisions whose references[].path matches (exact and normalized)", async () => {
		const index = await loadDecisionIndex(FIXTURE);
		try {
			const matches = index!.byPath("src/payments/gateway.ts")
				.map((d) => d.id)
				.sort();
			expect(matches).toEqual(["DL-002", "DL-004", "DL-005"]);

			// Leading "./" is normalized away.
			const normalized = index!.byPath("./src/auth/login.ts").map((d) => d.id);
			expect(normalized).toEqual(["DL-001"]);

			// Non-matching path → empty.
			expect(index!.byPath("src/nothing.ts")).toEqual([]);
		} finally {
			index?.close();
		}
	});

	test("byStatus('proposed') / byTag() filter correctly", async () => {
		const index = await loadDecisionIndex(FIXTURE);
		try {
			expect(index!.byStatus("proposed").map((d) => d.id)).toEqual(["DL-003"]);
			expect(index!.byStatus("superseded").map((d) => d.id)).toEqual(["DL-004"]);

			expect(index!.byTag("payments").map((d) => d.id).sort()).toEqual([
				"DL-002",
				"DL-004",
				"DL-005",
			]);
			expect(index!.byTag("auth").map((d) => d.id).sort()).toEqual(["DL-001", "DL-003"]);
			expect(index!.byTag("nonexistent")).toEqual([]);
		} finally {
			index?.close();
		}
	});

	test("search() supports numeric prefix and substring match", async () => {
		const index = await loadDecisionIndex(FIXTURE);
		try {
			// Numeric prefix
			expect(index!.search("3").map((d) => d.id)).toEqual(["DL-003"]);

			// Title substring
			expect(index!.search("backoff").map((d) => d.id)).toEqual(["DL-005"]);

			// Tag substring (matches any decision with the tag)
			expect(index!.search("payments").map((d) => d.id).sort()).toEqual([
				"DL-002",
				"DL-004",
				"DL-005",
			]);

			// Empty query returns everything
			expect(index!.search("").length).toBe(5);
		} finally {
			index?.close();
		}
	});

	test("recent(n) returns most recently timestamped decisions, live first", async () => {
		const index = await loadDecisionIndex(FIXTURE);
		try {
			// Live (proposed/accepted), newest first:
			//   DL-005 (2026-03-04 accepted)
			//   DL-003 (2026-02-02 proposed)
			//   DL-002 (2026-01-14 accepted)
			//   DL-001 (2026-01-10 accepted)
			// Then stale (superseded/deprecated):
			//   DL-004 (2026-02-18 superseded)
			expect(index!.recent(5).map((d) => d.id)).toEqual([
				"DL-005",
				"DL-003",
				"DL-002",
				"DL-001",
				"DL-004",
			]);

			// Limit honored
			expect(index!.recent(2).map((d) => d.id)).toEqual(["DL-005", "DL-003"]);
		} finally {
			index?.close();
		}
	});

	test("reads harness: block from dld.config.yaml into harnessConfig", async () => {
		const index = await loadDecisionIndex(FIXTURE);
		try {
			expect(index!.harnessConfig).toBeDefined();
			expect(index!.harnessConfig!.guardrail_mode).toBe("surface");
			expect(index!.harnessConfig!.lookback_turns).toBe(6);
		} finally {
			index?.close();
		}
	});

	test("onChange() fires on add / update / remove via fs.watch", async () => {
		const dir = mkdtempSync(join(tmpdir(), "dld-watch-"));
		try {
			writeFileSync(
				join(dir, "dld.config.yaml"),
				"decisions_dir: decisions\nmode: flat\n",
			);
			mkdirSync(join(dir, "decisions/records"), { recursive: true });

			const index = await loadDecisionIndex(dir);
			expect(index).not.toBeNull();
			expect(index!.list()).toHaveLength(0);

			const events: IndexChange[] = [];
			index!.onChange((e) => events.push(e));

			// Give the watcher a moment to register.
			await sleep(50);

			const file = join(dir, "decisions/records/DL-001.md");
			const v1 = [
				"---",
				"id: DL-001",
				'title: "Watched"',
				"timestamp: 2026-01-01T00:00:00Z",
				"status: proposed",
				"---",
				"",
				"body",
			].join("\n");
			writeFileSync(file, v1);

			// Wait for debounce (100ms) + processing.
			await sleep(300);

			// Update
			const v2 = v1.replace("status: proposed", "status: accepted");
			writeFileSync(file, v2);
			await sleep(300);

			// Remove
			await unlink(file);
			await sleep(300);

			expect(events.length).toBeGreaterThanOrEqual(3);
			const kinds = events.map((e) => e.kind);
			expect(kinds).toContain("added");
			expect(kinds).toContain("updated");
			expect(kinds).toContain("removed");

			index!.close();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
