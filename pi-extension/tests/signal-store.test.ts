import { describe, expect, test } from "bun:test";
import {
	type ChangeReason,
	DEFAULT_URGENCY,
	SignalStore,
} from "../src/core/signal-store.ts";

// Deterministic clock so id+ts are stable across runs.
function fixedClock(startMs = 1_700_000_000_000): () => Date {
	let n = startMs;
	return () => {
		const d = new Date(n);
		n += 1000;
		return d;
	};
}

describe("SignalStore.add", () => {
	test("assigns sequential ids and timestamps", () => {
		const store = new SignalStore({ now: fixedClock() });
		const a = store.add({ kind: "progress", title: "first" });
		const b = store.add({ kind: "review", title: "second" });
		expect(a.id).toBe("sig-0001");
		expect(b.id).toBe("sig-0002");
		expect(a.ts < b.ts).toBe(true);
	});

	test("applies default urgency from kind when omitted", () => {
		const store = new SignalStore({ now: fixedClock() });
		const prog = store.add({ kind: "progress", title: "x" });
		const blocked = store.add({ kind: "blocked", title: "y" });
		expect(prog.urgency).toBe(DEFAULT_URGENCY.progress);
		expect(blocked.urgency).toBe("act-now");
	});

	test("allows explicit urgency override", () => {
		const store = new SignalStore({ now: fixedClock() });
		const s = store.add({
			kind: "progress",
			title: "milestone",
			urgency: "review",
		});
		expect(s.urgency).toBe("review");
	});

	test("starts unread and unresolved", () => {
		const store = new SignalStore({ now: fixedClock() });
		const s = store.add({ kind: "review", title: "t" });
		expect(s.read).toBe(false);
		expect(s.resolved).toBe(false);
	});

	test("returned signal is frozen (cannot be mutated by caller)", () => {
		const store = new SignalStore({ now: fixedClock() });
		const s = store.add({ kind: "progress", title: "t" });
		expect(() => {
			// @ts-expect-error: readonly field; runtime should also reject
			s.read = true;
		}).toThrow();
	});
});

describe("SignalStore.markRead / markResolved", () => {
	test("markRead flips read flag and notifies", () => {
		const store = new SignalStore({ now: fixedClock() });
		const events: ChangeReason[] = [];
		store.onChange((r) => events.push(r));
		const s = store.add({ kind: "review", title: "t" });
		events.length = 0; // ignore the add event
		expect(store.markRead(s.id)).toBe(true);
		expect(store.get(s.id)!.read).toBe(true);
		expect(events).toEqual([{ type: "read", id: s.id }]);
	});

	test("markRead on already-read is a no-op", () => {
		const store = new SignalStore({ now: fixedClock() });
		const events: ChangeReason[] = [];
		const s = store.add({ kind: "review", title: "t" });
		store.markRead(s.id);
		store.onChange((r) => events.push(r));
		expect(store.markRead(s.id)).toBe(false);
		expect(events).toEqual([]);
	});

	test("markResolved also flips read", () => {
		const store = new SignalStore({ now: fixedClock() });
		const s = store.add({ kind: "blocked", title: "halt" });
		expect(store.markResolved(s.id, "user answered")).toBe(true);
		const after = store.get(s.id)!;
		expect(after.read).toBe(true);
		expect(after.resolved).toBe(true);
	});

	test("markResolved is idempotent", () => {
		const store = new SignalStore({ now: fixedClock() });
		const events: ChangeReason[] = [];
		const s = store.add({ kind: "blocked", title: "halt" });
		store.markResolved(s.id);
		store.onChange((r) => events.push(r));
		expect(store.markResolved(s.id)).toBe(false);
		expect(events).toEqual([]);
	});

	test("unknown id is a no-op", () => {
		const store = new SignalStore({ now: fixedClock() });
		expect(store.markRead("sig-9999")).toBe(false);
		expect(store.markResolved("sig-9999")).toBe(false);
	});

	test("markAllAsRead flips every unread signal and returns count", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "a" });
		const b = store.add({ kind: "review", title: "b" });
		store.markRead(b.id); // already read
		store.add({ kind: "amend-needed", title: "c" });
		const events: ChangeReason[] = [];
		store.onChange((r) => events.push(r));
		expect(store.markAllAsRead()).toBe(2); // a and c
		expect(store.unreadCount()).toBe(0);
		// Two read events fired (one per flipped signal); b was already read.
		expect(events.filter((e) => e.type === "read")).toHaveLength(2);
	});

	test("markAllAsRead on empty store returns 0", () => {
		const store = new SignalStore({ now: fixedClock() });
		expect(store.markAllAsRead()).toBe(0);
	});

	test("markAllAsRead is idempotent", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "a" });
		expect(store.markAllAsRead()).toBe(1);
		expect(store.markAllAsRead()).toBe(0);
	});
});

describe("SignalStore counts and queries", () => {
	test("unreadCount tracks across read/add", () => {
		const store = new SignalStore({ now: fixedClock() });
		expect(store.unreadCount()).toBe(0);
		const a = store.add({ kind: "progress", title: "a" });
		store.add({ kind: "review", title: "b" });
		expect(store.unreadCount()).toBe(2);
		store.markRead(a.id);
		expect(store.unreadCount()).toBe(1);
	});

	test("pendingActNowCount only counts act-now and unresolved", () => {
		const store = new SignalStore({ now: fixedClock() });
		const blocked = store.add({ kind: "blocked", title: "b" });
		store.add({ kind: "review", title: "r" });
		store.add({
			kind: "progress",
			title: "milestone",
			urgency: "act-now", // override to test it
		});
		expect(store.pendingActNowCount()).toBe(2);
		store.markResolved(blocked.id);
		expect(store.pendingActNowCount()).toBe(1);
	});

	test("latestActionable skips progress and resolved", () => {
		const store = new SignalStore({ now: fixedClock() });
		const review = store.add({ kind: "review", title: "old review" });
		store.add({ kind: "progress", title: "step 1" });
		store.add({ kind: "progress", title: "step 2" });
		// review is latest non-progress, unresolved → that's the target
		expect(store.latestActionable()?.id).toBe(review.id);
		store.markResolved(review.id);
		expect(store.latestActionable()).toBeUndefined();
	});

	test("latestActionable prefers newer over older", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "old" });
		const newer = store.add({ kind: "amend-needed", title: "new" });
		expect(store.latestActionable()?.id).toBe(newer.id);
	});
});

describe("SignalStore.list ordering and immutability", () => {
	test("oldest-first insertion order", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "progress", title: "a" });
		store.add({ kind: "progress", title: "b" });
		store.add({ kind: "progress", title: "c" });
		expect(store.list().map((s) => s.title)).toEqual(["a", "b", "c"]);
	});

	test("list snapshots are independent of store mutations", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "review", title: "t" });
		const snap1 = store.list();
		store.add({ kind: "review", title: "u" });
		expect(snap1.length).toBe(1); // snapshot frozen at time of call
		expect(store.list().length).toBe(2);
	});
});

describe("SignalStore.onChange", () => {
	test("delivers add/read/resolved in order", () => {
		const store = new SignalStore({ now: fixedClock() });
		const events: ChangeReason[] = [];
		store.onChange((r) => events.push(r));
		const s = store.add({ kind: "blocked", title: "halt" });
		store.markResolved(s.id);
		expect(events.map((e) => e.type)).toEqual(["added", "resolved"]);
	});

	test("listener throwing does not break the store or other listeners", () => {
		const store = new SignalStore({ now: fixedClock() });
		const seen: string[] = [];
		store.onChange(() => {
			throw new Error("boom");
		});
		store.onChange((r) => {
			if (r.type === "added") seen.push(r.signal.title);
		});
		store.add({ kind: "progress", title: "ok" });
		expect(seen).toEqual(["ok"]);
	});

	test("unsubscribe stops delivery", () => {
		const store = new SignalStore({ now: fixedClock() });
		const events: ChangeReason[] = [];
		const off = store.onChange((r) => events.push(r));
		store.add({ kind: "progress", title: "a" });
		off();
		store.add({ kind: "progress", title: "b" });
		expect(events.length).toBe(1);
	});
});

describe("SignalStore.clear", () => {
	test("wipes state and resets counter", () => {
		const store = new SignalStore({ now: fixedClock() });
		store.add({ kind: "progress", title: "a" });
		store.add({ kind: "progress", title: "b" });
		store.clear();
		expect(store.list()).toEqual([]);
		expect(store.unreadCount()).toBe(0);
		const after = store.add({ kind: "progress", title: "c" });
		expect(after.id).toBe("sig-0001"); // counter reset
	});
});
