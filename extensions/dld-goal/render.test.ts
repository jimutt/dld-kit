import { describe, expect, test } from "bun:test";
import { boardLines, cardLines, statusLine, widgetLines, type CardData } from "./render.ts";
import type { RunState, WorkItem } from "./run-state.ts";

function item(index: number, status: WorkItem["status"], decisions: string[] = []): WorkItem {
	return {
		index,
		decisions: decisions.map((id) => ({ id, hash: "sha256:x" })),
		status,
		acceptance: { annotations: [], checks: [] },
		attempts: 0,
		evidence: [],
	};
}

function stateWith(items: WorkItem[], overrides: Partial<RunState> = {}): RunState {
	return {
		schemaVersion: 1,
		slug: "payments",
		title: "Payment gateway",
		status: "active",
		createdAt: new Date(Date.now() - 34 * 60 * 1000).toISOString(),
		updatedAt: new Date().toISOString(),
		bounds: { maxItems: 0, maxMinutes: 120 },
		review: "enabled",
		currentItem: items.find((i) => i.status === "implementing" || i.status === "verifying")?.index ?? null,
		items,
		blockedQuestions: [],
		...overrides,
	};
}

describe("statusLine", () => {
	test("shows slug, progress, current item, and elapsed against bound", () => {
		const state = stateWith([item(1, "accepted", ["DL-010"]), item(2, "verifying", ["DL-011", "DL-012"])]);
		const line = statusLine(state);
		expect(line).toContain("payments 1/2");
		expect(line).toContain("DL-011 DL-012 verifying");
		expect(line).toMatch(/\d+m\/120m/);
	});

	test("names open blocked questions", () => {
		const state = stateWith([item(1, "blocked")], {
			blockedQuestions: [{ itemIndex: 1, question: "which sandbox?" }],
		});
		expect(statusLine(state)).toContain("1 blocked question");
	});

	test("no bound means plain elapsed", () => {
		const state = stateWith([item(1, "pending")], { bounds: { maxItems: 0, maxMinutes: 0 } });
		expect(statusLine(state)).toMatch(/\d+m$/);
	});
});

describe("widgetLines", () => {
	test("renders exactly five lines for a small run", () => {
		const state = stateWith([item(1, "accepted", ["DL-010"]), item(2, "verifying", ["DL-011"]), item(3, "pending")]);
		const lines = widgetLines(state);
		expect(lines).toHaveLength(5);
		expect(lines[0]).toContain("dld-goal payments");
		expect(lines[0]).toContain("1/3");
	});

	test("renders exactly five lines for a large run — height is invariant", () => {
		const many = Array.from({ length: 30 }, (_, i) =>
			item(i + 1, i < 14 ? "accepted" : i === 14 ? "implementing" : "pending", [`DL-${String(i + 10).padStart(3, "0")}`]),
		);
		const lines = widgetLines(stateWith(many));
		expect(lines).toHaveLength(5);
		expect(lines.some((l) => l.includes("more"))).toBe(true);
	});

	test("an empty run still renders five lines", () => {
		expect(widgetLines(stateWith([]))).toHaveLength(5);
	});

	test("the current item is always inside the window", () => {
		const many = Array.from({ length: 30 }, (_, i) =>
			item(i + 1, i === 27 ? "verifying" : i < 27 ? "accepted" : "pending"),
		);
		const lines = widgetLines(stateWith(many));
		expect(lines.some((l) => l.includes("▸ 28") || l.includes("28"))).toBe(true);
	});

	test("every line is short enough for a narrow terminal", () => {
		const many = Array.from({ length: 30 }, (_, i) => item(i + 1, "pending", [`DL-${i}`]));
		for (const line of widgetLines(stateWith(many))) {
			expect(line.length).toBeLessThanOrEqual(60);
		}
	});
});

describe("cardLines", () => {
	test("accepted card names the decisions", () => {
		const card: CardData = { kind: "item-accepted", slug: "payments", itemIndex: 2, decisions: ["DL-011", "DL-012"] };
		expect(cardLines(card)[0]).toContain("item 2 accepted · DL-011, DL-012");
	});

	test("blocked card carries the detail as indented lines", () => {
		const card: CardData = { kind: "item-blocked", slug: "payments", itemIndex: 1, decisions: ["DL-010"], detail: "annotations missing\nnpm test failed" };
		const lines = cardLines(card);
		expect(lines[0]).toContain("item 1 blocked");
		expect(lines).toContain("  annotations missing");
		expect(lines).toContain("  npm test failed");
	});
});

describe("boardLines", () => {
	test("shows every item, evidence, and questions without a height cap", () => {
		const ev = { kind: "annotations", ok: true };
		const items = [item(1, "accepted", ["DL-010"]), item(2, "blocked", ["DL-011"])];
		items[0]!.evidence.push(ev);
		const state = stateWith(items, {
			status: "blocked",
			blockedQuestions: [{ itemIndex: 2, question: "which sandbox?" }],
		});
		const lines = boardLines(state);
		expect(lines.length).toBeGreaterThan(8);
		expect(lines.join("\n")).toContain("item 2 · DL-011 · blocked");
		expect(lines.join("\n")).toContain("which sandbox?");
		expect(lines.join("\n")).toContain("esc to close");
	});
});
