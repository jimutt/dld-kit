// Tests for the autocomplete trigger / ranking helpers.
//
// The provider itself is exercised manually against Pi (see README dev
// loop). Here we cover the pure functions: trigger extraction, candidate
// ranking.

import { describe, expect, test } from "bun:test";
import { extractTrigger, rankCandidates } from "../src/features/autocomplete.ts";
import type { Decision } from "../src/core/decision-index.ts";

function mkDecision(partial: Partial<Decision> & Pick<Decision, "id" | "status" | "timestamp">): Decision {
	return {
		numericId: parseInt(partial.id.slice(3), 10),
		title: "t",
		tags: [],
		supersedes: [],
		amends: [],
		references: [],
		filePath: "",
		...partial,
	};
}

describe("extractTrigger", () => {
	test("matches inside @decision(DL- (annotation trigger)", () => {
		expect(extractTrigger("// @decision(DL-")).toEqual({
			kind: "annotation",
			token: "",
		});
		expect(extractTrigger("// @decision(DL-18")).toEqual({
			kind: "annotation",
			token: "18",
		});
		// Case-insensitive on the DL- portion.
		expect(extractTrigger("@decision(dl-1")).toEqual({
			kind: "annotation",
			token: "1",
		});
	});

	test("matches @ shortcut for both mentions and full-annotation insertion", () => {
		expect(extractTrigger("@")).toEqual({ kind: "at-shortcut", token: "" });
		expect(extractTrigger("paste @auth")).toEqual({
			kind: "at-shortcut",
			token: "auth",
		});
		expect(extractTrigger("foo @backoff")).toEqual({
			kind: "at-shortcut",
			token: "backoff",
		});
		// Typing `@DL-185` is the natural mention path. Token includes the `DL-`.
		expect(extractTrigger("@DL-185")).toEqual({
			kind: "at-shortcut",
			token: "DL-185",
		});
	});

	test("annotation pattern wins over at-shortcut when both could match the @", () => {
		// Both regexes contain `@`, but annotation is tested first so the
		// (DL- token) and the closing-paren insertion path are preferred.
		expect(extractTrigger("  @decision(DL-185")).toEqual({
			kind: "annotation",
			token: "185",
		});
	});

	test("does NOT match @ mid-word", () => {
		expect(extractTrigger("foo@bar")).toBeNull();
		expect(extractTrigger("nothing here")).toBeNull();
	});

	test("does NOT match bare DL- (structurally blocked by Pi auto-trigger gate)", () => {
		// Bare `DL-` never reaches our provider in real Pi — the editor only
		// auto-invokes autocomplete in `/`, `@`, or `#` contexts. See
		// Asserting the explicit
		// non-match here so the limitation is captured in code, not just docs.
		expect(extractTrigger("DL-")).toBeNull();
		expect(extractTrigger("DL-185")).toBeNull();
		expect(extractTrigger("look at DL-1")).toBeNull();
	});
});

describe("rankCandidates", () => {
	test("live (proposed/accepted) come before stale (superseded/deprecated)", () => {
		const c = [
			mkDecision({ id: "DL-001", status: "superseded", timestamp: "2030-01-01T00:00:00.000Z" }),
			mkDecision({ id: "DL-002", status: "accepted", timestamp: "2020-01-01T00:00:00.000Z" }),
			mkDecision({ id: "DL-003", status: "deprecated", timestamp: "2030-01-01T00:00:00.000Z" }),
			mkDecision({ id: "DL-004", status: "proposed", timestamp: "2020-01-01T00:00:00.000Z" }),
		];
		const ranked = rankCandidates(c).map((d) => d.id);
		// DL-002 (live, accepted) and DL-004 (live, proposed) before stale.
		expect(ranked.slice(0, 2).sort()).toEqual(["DL-002", "DL-004"]);
		expect(ranked.slice(2).sort()).toEqual(["DL-001", "DL-003"]);
	});

	test("within live, sorts by timestamp desc", () => {
		const c = [
			mkDecision({ id: "DL-001", status: "accepted", timestamp: "2020-01-01T00:00:00.000Z" }),
			mkDecision({ id: "DL-002", status: "accepted", timestamp: "2030-01-01T00:00:00.000Z" }),
			mkDecision({ id: "DL-003", status: "accepted", timestamp: "2025-01-01T00:00:00.000Z" }),
		];
		expect(rankCandidates(c).map((d) => d.id)).toEqual(["DL-002", "DL-003", "DL-001"]);
	});

	test("ties on (live, timestamp) broken by status order (proposed > accepted)", () => {
		const c = [
			mkDecision({ id: "DL-001", status: "accepted", timestamp: "2020-01-01T00:00:00.000Z" }),
			mkDecision({ id: "DL-002", status: "proposed", timestamp: "2020-01-01T00:00:00.000Z" }),
		];
		expect(rankCandidates(c).map((d) => d.id)).toEqual(["DL-002", "DL-001"]);
	});

	test("does not mutate input", () => {
		const c = [
			mkDecision({ id: "DL-001", status: "accepted", timestamp: "2020-01-01T00:00:00.000Z" }),
			mkDecision({ id: "DL-002", status: "accepted", timestamp: "2030-01-01T00:00:00.000Z" }),
		];
		const before = c.map((d) => d.id);
		rankCandidates(c);
		expect(c.map((d) => d.id)).toEqual(before);
	});
});
