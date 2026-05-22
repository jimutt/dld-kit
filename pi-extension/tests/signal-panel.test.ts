import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { SignalStore } from "../src/core/signal-store.ts";
import { SignalPanel } from "../src/ui/signal-panel.ts";

/**
 * Minimal fake Theme — returns plain strings so test assertions can
 * grep the visible content without ANSI noise. Real Theme would wrap
 * with terminal escape codes; we don't care here.
 */
function fakeTheme() {
	return {
		fg: (_color: string, text: string) => text,
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		dim: (text: string) => text,
	} as unknown as import("@earendil-works/pi-coding-agent").Theme;
}

function fixedClock(startMs = 1_700_000_000_000): () => Date {
	let n = startMs;
	return () => {
		const d = new Date(n);
		n += 1000;
		return d;
	};
}

const HELP = "ctrl+space respond";
const WIDTH = 60;

describe("SignalPanel header", () => {
	test("shows total only when no unread", () => {
		const store = new SignalStore({ now: fixedClock() });
		const s = store.add({ kind: "progress", title: "a" });
		store.markRead(s.id);
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const lines = panel.render(WIDTH);
		expect(lines[0]).toContain("DLD signals · 1 total");
		expect(lines[0]).not.toContain("unread");
	});

	test("shows unread count when present", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "a" });
		store.add({ kind: "review", title: "b" });
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const lines = panel.render(WIDTH);
		expect(lines[0]).toContain("DLD signals · 2 total · 2 unread");
	});
});

describe("SignalPanel empty state", () => {
	test("renders an empty-state hint when no signals", () => {
		const store = new SignalStore({ now: fixedClock() });
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const lines = panel.render(WIDTH);
		expect(lines.some((l) => l.includes("(no signals yet)"))).toBe(true);
	});
});

describe("SignalPanel signal rendering", () => {
	test("renders kind label, title, and time per signal", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({
			kind: "amend-needed",
			title: "rationale is stale",
			decisionRef: "DL-218",
		});
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const out = panel.render(WIDTH).join("\n");
		expect(out).toContain("amend");
		// decisionRef prepended as 'DL-218: ' when title doesn't already start with it
		expect(out).toContain("DL-218: rationale is stale");
	});

	test("does NOT double-prefix decisionRef when title already starts with it", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({
			kind: "amend-needed",
			title: "DL-218 rationale is stale",
			decisionRef: "DL-218",
		});
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const out = panel.render(WIDTH).join("\n");
		expect(out).toContain("DL-218 rationale is stale");
		expect(out).not.toContain("DL-218: DL-218");
	});

	test("includes detail wrapped beneath the title", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({
			kind: "review",
			title: "Concurrency choice",
			detail:
				"You picked concurrency=8 over the previously documented 4 in DL-169; rationale is reasonable but worth a glance.",
		});
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const out = panel.render(WIDTH).join("\n");
		expect(out).toContain("Concurrency choice");
		expect(out).toContain("rationale is reasonable");
	});

	test("includes suggestedAction with arrow when present and not resolved", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({
			kind: "question",
			title: "Pick between A and B",
			suggestedAction: "Pick A or B in panel",
		});
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const out = panel.render(WIDTH).join("\n");
		expect(out).toContain("→ Pick A or B in panel");
	});

	test("hides suggestedAction once resolved", () => {
		const store = new SignalStore({ now: fixedClock() });
		const sig = store.add({
			kind: "blocked",
			title: "halt",
			suggestedAction: "do the thing",
		});
		store.markResolved(sig.id);
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const out = panel.render(WIDTH).join("\n");
		expect(out).not.toContain("→ do the thing");
	});

	test("shows ★ for unread, ✓ for resolved", () => {
		const store = new SignalStore({ now: fixedClock() });
		const unread = store.add({ kind: "review", title: "a" });
		const resolved = store.add({ kind: "blocked", title: "b" });
		store.markResolved(resolved.id);
		// markRead the unread so we can tell apart unread vs read-not-resolved
		const readish = store.add({ kind: "progress", title: "c" });
		store.markRead(readish.id);
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const out = panel.render(WIDTH);
		// Find lines mentioning each title
		const lineA = out.find((l) => l.includes(" a "));
		const lineB = out.find((l) => l.includes(" b"));
		expect(lineA).toContain("★");
		expect(lineB).toContain("✓");
		void unread;
	});
});

describe("SignalPanel width handling", () => {
	test("never produces a line wider than the requested width (wide)", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({
			kind: "amend-needed",
			title:
				"this is a deliberately long title designed to overflow the panel and force truncation behavior",
			detail:
				"and the detail is also long enough to wrap across multiple lines so we can verify the wrap helper preserves width constraints",
			decisionRef: "DL-218",
			suggestedAction: "do something",
		});
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		for (const w of [60, 40, 30]) {
			const lines = panel.render(w);
			for (const l of lines) {
				expect(visibleWidth(l)).toBeLessThanOrEqual(w);
			}
		}
	});

	test("compact layout kicks in below 36 cols", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "x" });
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const wide = panel.render(60).join("\n");
		expect(wide).toContain("review   ·"); // padded label + 1 trailing space + separator
		const compactPanel = new SignalPanel({
			store,
			theme: fakeTheme(),
			helpText: HELP,
		});
		const narrow = compactPanel.render(30).join("\n");
		// compact drops the padded label column
		expect(narrow).not.toContain("review  ·");
	});
});

describe("SignalPanel caching", () => {
	test("caches lines by width; invalidate() forces rebuild", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "progress", title: "a" });
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const a = panel.render(50);
		const b = panel.render(50);
		expect(a).toBe(b); // same reference (cache hit)
		panel.invalidate();
		const c = panel.render(50);
		expect(c).not.toBe(a);
	});

	test("setHelpText invalidates", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "progress", title: "a" });
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const before = panel.render(50);
		panel.setHelpText("new help");
		const after = panel.render(50);
		expect(after).not.toBe(before);
		expect(after.join("\n")).toContain("new help");
	});
});

describe("SignalPanel ordering and chat-log feel", () => {
	test("renders signals oldest-at-top, newest-at-bottom", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "progress", title: "first" });
		store.add({ kind: "progress", title: "second" });
		store.add({ kind: "progress", title: "third" });
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const lines = panel.render(WIDTH);
		const idxFirst = lines.findIndex((l) => l.includes(" first "));
		const idxThird = lines.findIndex((l) => l.includes(" third "));
		expect(idxFirst).toBeGreaterThan(0);
		expect(idxThird).toBeGreaterThan(idxFirst);
	});
});

describe("SignalPanel interactive mode", () => {
	test("setFocused(true) seeds selection to latestActionable", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "progress", title: "a" });
		store.add({ kind: "review", title: "b" }); // latest actionable
		store.add({ kind: "progress", title: "c" });
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		expect(panel.focused).toBe(true);
		expect(panel.selectedIndex).toBe(1);
	});

	test("setFocused(true) with empty store leaves selectedIndex at -1", () => {
		const store = new SignalStore({ now: fixedClock() });
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		expect(panel.selectedIndex).toBe(-1);
	});

	test("setFocused(true) with only progress signals lands on last", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "progress", title: "a" });
		store.add({ kind: "progress", title: "b" });
		store.add({ kind: "progress", title: "c" });
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		expect(panel.selectedIndex).toBe(2);
	});

	test("j/k navigate up and down, clamped to bounds", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "a" });
		store.add({ kind: "review", title: "b" });
		store.add({ kind: "review", title: "c" });
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		expect(panel.selectedIndex).toBe(2);
		panel.handleInput("k");
		expect(panel.selectedIndex).toBe(1);
		panel.handleInput("k");
		expect(panel.selectedIndex).toBe(0);
		panel.handleInput("k");
		expect(panel.selectedIndex).toBe(0);
		panel.handleInput("j");
		expect(panel.selectedIndex).toBe(1);
	});

	test("enter fires onRespond with currently-selected signal", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "a" });
		const target = store.add({
			kind: "amend-needed",
			title: "b",
			decisionRef: "DL-1",
		});
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		const calls: { id: string; title: string }[] = [];
		panel.onRespond = (sig) => {
			calls.push({ id: sig.id, title: sig.title });
		};
		panel.handleInput("\r");
		expect(calls).toEqual([{ id: target.id, title: "b" }]);
	});

	test("r is a synonym for enter", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "a" });
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		let called = false;
		panel.onRespond = () => {
			called = true;
		};
		panel.handleInput("r");
		expect(called).toBe(true);
	});

	test("x fires onResolve and stays in interactive mode", () => {
		const store = new SignalStore({ now: fixedClock() });
		const sig = store.add({ kind: "blocked", title: "a" });
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		const calls: string[] = [];
		panel.onResolve = (s) => {
			calls.push(s.id);
		};
		panel.handleInput("x");
		expect(calls).toEqual([sig.id]);
		expect(panel.focused).toBe(true);
	});

	test("esc fires onCancel", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "a" });
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		let cancelled = false;
		panel.onCancel = () => {
			cancelled = true;
		};
		panel.handleInput("\x1b");
		expect(cancelled).toBe(true);
	});

	test("enter/r/x are no-ops on a selected progress signal", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "progress", title: "reading" });
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		// Force selection onto the progress signal (seedSelection landed
		// on it because there are no actionable signals at all).
		expect(panel.selectedIndex).toBe(0);
		const respondCalls: string[] = [];
		const resolveCalls: string[] = [];
		panel.onRespond = (s) => respondCalls.push(s.id);
		panel.onResolve = (s) => resolveCalls.push(s.id);
		panel.handleInput("\r"); // enter
		panel.handleInput("r");
		panel.handleInput("x");
		expect(respondCalls).toEqual([]);
		expect(resolveCalls).toEqual([]);
	});

	test("navigation still lands on progress signals; actions fire on actionable ones", () => {
		const store = new SignalStore({ now: fixedClock() });
		const review = store.add({ kind: "review", title: "act" });
		store.add({ kind: "progress", title: "passive" });
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		// Seeded to review (latestActionable), index 0
		expect(panel.selectedIndex).toBe(0);
		const respondCalls: string[] = [];
		panel.onRespond = (s) => respondCalls.push(s.id);
		panel.handleInput("\r");
		expect(respondCalls).toEqual([review.id]);
		// Now navigate down onto the progress signal
		respondCalls.length = 0;
		panel.handleInput("j");
		expect(panel.selectedIndex).toBe(1);
		panel.handleInput("\r"); // no-op on progress
		expect(respondCalls).toEqual([]);
	});

	test("unhandled keys silently consumed (no callbacks fired)", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "a" });
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		let anyCall = false;
		panel.onRespond = () => {
			anyCall = true;
		};
		panel.onResolve = () => {
			anyCall = true;
		};
		panel.onCancel = () => {
			anyCall = true;
		};
		panel.handleInput("a");
		panel.handleInput("h");
		panel.handleInput("q");
		expect(anyCall).toBe(false);
	});

	test("focused mode shows cursor and focused help text", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "alpha" });
		store.add({ kind: "review", title: "beta" });
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		const out = panel.render(WIDTH).join("\n");
		expect(out).toMatch(/▸.*beta/);
		expect(out).toContain("navigate");
		expect(out).toContain("enter respond");
	});

	test("passive mode does not show selection cursor", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "alpha" });
		const panel = new SignalPanel({ store, theme: fakeTheme(), helpText: HELP });
		const out = panel.render(WIDTH).join("\n");
		expect(out).not.toContain("▸");
		expect(out).toContain(HELP);
	});

	test("'a' key in focused mode fires onAckAll", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "alpha" });
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		panel.setFocused(true);
		let called = 0;
		panel.onAckAll = () => {
			called += 1;
		};
		panel.handleInput("a");
		expect(called).toBe(1);
	});
});

describe("SignalPanel read-signal collapse", () => {
	test("read signals render title only (no detail / no suggestedAction)", () => {
		const store = new SignalStore({ now: fixedClock() });
		const s = store.add({
			kind: "review",
			title: "my title",
			detail: "some detail body that should disappear when read",
			suggestedAction: "some action that should disappear when read",
		});
		store.markRead(s.id);
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		const out = panel.render(WIDTH).join("\n");
		expect(out).toContain("my title");
		expect(out).not.toContain("some detail body");
		expect(out).not.toContain("some action that should disappear");
	});

	test("selecting a read signal in focused mode re-expands its detail", () => {
		const store = new SignalStore({ now: fixedClock() });
		const s = store.add({
			kind: "review",
			title: "alpha",
			detail: "expanded detail line",
		});
		store.markRead(s.id);
		const panel = new SignalPanel({ store, theme: fakeTheme() });
		const passive = panel.render(WIDTH).join("\n");
		expect(passive).not.toContain("expanded detail line");
		panel.setFocused(true); // seeds selection to the only signal
		const focused = panel.render(WIDTH).join("\n");
		expect(focused).toContain("expanded detail line");
	});
});

describe("SignalPanel scrolling", () => {
	function buildBusyStore(): SignalStore {
		const store = new SignalStore({ now: fixedClock() });
		for (let i = 1; i <= 8; i += 1) {
			store.add({
				kind: "review",
				title: `signal ${i}`,
				detail: `detail line for signal ${i}`,
			});
		}
		return store;
	}

	test("passive view auto-sticks to the latest signal", () => {
		const store = buildBusyStore();
		const panel = new SignalPanel({
			store,
			theme: fakeTheme(),
			getMaxBodyRows: () => 6,
		});
		const out = panel.render(WIDTH).join("\n");
		expect(out).toContain("signal 8"); // latest visible
		expect(out).toContain("older above"); // scroll indicator on top
		expect(out).not.toContain("more below"); // already at the bottom
	});

	test("navigating up past the viewport scrolls older signals into view", () => {
		const store = buildBusyStore();
		const panel = new SignalPanel({
			store,
			theme: fakeTheme(),
			getMaxBodyRows: () => 6,
		});
		panel.setFocused(true); // selectedIndex = 7 (latest actionable)
		// Walk up several rows; the older signals should reveal
		for (let i = 0; i < 5; i += 1) panel.handleInput("k");
		const out = panel.render(WIDTH).join("\n");
		expect(out).toContain("signal 3"); // older one now visible
		expect(out).toContain("more below"); // selection scrolled up so newer ones now off-bottom
	});

	test("scroll indicators count correct older/newer amounts", () => {
		const store = buildBusyStore();
		const panel = new SignalPanel({
			store,
			theme: fakeTheme(),
			getMaxBodyRows: () => 6,
		});
		const out = panel.render(WIDTH).join("\n");
		// Auto-stick shows latest (signal 8); 8 total, ~2 visible per the
		// 6-row budget (each unread signal = ~2 rows), so ~6 above.
		expect(out).toMatch(/↑ \d+ older above/);
	});

	test("unlimited maxBodyRows skips scrolling and renders all", () => {
		const store = buildBusyStore();
		const panel = new SignalPanel({
			store,
			theme: fakeTheme(),
			// No getMaxBodyRows = Infinity = render everything
		});
		const out = panel.render(WIDTH).join("\n");
		expect(out).not.toContain("older above");
		expect(out).not.toContain("more below");
		for (let i = 1; i <= 8; i += 1) {
			expect(out).toContain(`signal ${i}`);
		}
	});
});
