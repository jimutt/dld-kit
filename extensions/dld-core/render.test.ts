import { describe, expect, test } from "bun:test";
import { boardLines, statusLine, widgetLines } from "./render.ts";
import { activeMinutes, type RunState, type WorkItem } from "./run-state.ts";

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
		expect(lines[0]).toContain("dld-run payments");
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

	test("every line fits the sidebar", () => {
		const many = Array.from({ length: 30 }, (_, i) => item(i + 1, "pending", [`DL-${i}`]));
		for (const line of widgetLines(stateWith(many))) {
			expect(line.length).toBeLessThanOrEqual(34);
		}
	});

	test("the bound suffix is shed before the slug is touched", () => {
		const state = stateWith([item(1, "verifying", ["DL-001"])], { slug: "dl-001-008" });
		const header = widgetLines(state)[0]!;
		expect(header.length).toBeLessThanOrEqual(34);
		expect(header).toContain("dl-001-008");
		expect(header).not.toContain("/120m");
	});

	test("a slug too long even without the bound is truncated", () => {
		const state = stateWith([item(1, "verifying", ["DL-001"])], { slug: "a-rather-long-run-slug" });
		const header = widgetLines(state)[0]!;
		expect(header.length).toBeLessThanOrEqual(34);
		expect(header).toContain("…");
		expect(header).toContain("a-rather");
	});
});

describe("activeMinutes", () => {
	test("a run that was never paused measures wall-clock", () => {
		const state = stateWith([item(1, "pending")]);
		const minutes = activeMinutes(state, []);
		expect(minutes).toBeGreaterThan(30);
		expect(minutes).toBeLessThan(40);
	});

	test("paused time does not count", () => {
		const state = stateWith([item(1, "pending")]);
		const created = Date.parse(state.createdAt);
		const events = [
			{ type: "run-paused", timestamp: new Date(created + 10 * 60000).toISOString() },
			{ type: "run-resumed", timestamp: new Date(created + 700 * 60000).toISOString() },
		];
		const minutes = activeMinutes(state, events);
		// 10 minutes before the pause, plus a little since resume — not 700+.
		expect(minutes).toBeLessThan(50);
		expect(minutes).toBeGreaterThan(9);
	});

	test("a completed run stops counting", () => {
		const state = stateWith([item(1, "accepted")]);
		const created = Date.parse(state.createdAt);
		const events = [
			{ type: "run-paused", timestamp: new Date(created + 10 * 60000).toISOString() },
			{ type: "run-completed", timestamp: new Date(created + 20 * 60000).toISOString() },
		];
		const minutes = activeMinutes(state, events);
		expect(minutes).toBe(10);
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

describe("widgetLines row width", () => {
	// The sidebar is a fixed width. A row wider than it wraps, which puts the
	// status on a line of its own and reads as a layout bug.
	const WIDTH = 34;

	test("rows keep the status on the label's line", () => {
		const state = stateWith([
			item(1, "accepted", ["DL-004"]),
			item(2, "verifying", ["DL-005"]),
			item(3, "pending", ["DL-006"]),
		]);
		for (const line of widgetLines(state)) {
			expect(line.length).toBeLessThanOrEqual(WIDTH);
		}
	});

	test("long decision lists are truncated, not wrapped", () => {
		const state = stateWith([
			item(1, "implementing", ["DL-001", "DL-002", "DL-003"]),
			item(2, "pending", ["DL-004"]),
		]);
		const lines = widgetLines(state);
		for (const line of lines) {
			expect(line.length).toBeLessThanOrEqual(WIDTH);
		}
		expect(lines.some((l) => l.includes("…") && l.includes("implementing"))).toBe(true);
	});

	test("the label column tracks the window, not a fixed gutter", () => {
		const state = stateWith([item(1, "accepted", ["DL-004"]), item(2, "pending", ["DL-005"])]);
		const rows = widgetLines(state).slice(1).filter((l) => l.trim().length > 0);
		// A fixed 28-column gutter produced rows of 39 characters for IDs this
		// short; sized to the window they come in well under the sidebar width.
		for (const row of rows) expect(row.length).toBeLessThan(28);
	});
});
