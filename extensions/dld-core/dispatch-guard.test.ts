import { describe, expect, test } from "bun:test";
import { DispatchGuard } from "./dispatch-guard.ts";

// @decision(DL-024)
// The guard's policy: first suppression re-delivers, second surfaces a
// wedge, never two re-deliveries in a row.

describe("DispatchGuard", () => {
	test("new dispatch when the session has no prior dispatch", () => {
		const guard = new DispatchGuard();
		expect(guard.classify("s1", "run:1")).toBe("new");
	});

	test("new dispatch when the item changed", () => {
		const guard = new DispatchGuard();
		guard.record("s1", "run:1");
		expect(guard.classify("s1", "run:2")).toBe("new");
	});

	test("first suppression re-delivers", () => {
		const guard = new DispatchGuard();
		guard.record("s1", "run:1");
		expect(guard.classify("s1", "run:1")).toBe("redeliver");
	});

	test("second suppression is wedged", () => {
		const guard = new DispatchGuard();
		guard.record("s1", "run:1");
		guard.classify("s1", "run:1"); // redeliver
		guard.record("s1", "run:1"); // records the re-delivery
		expect(guard.classify("s1", "run:1")).toBe("wedged");
	});

	test("after wedge, further suppressions are suppress", () => {
		const guard = new DispatchGuard();
		guard.record("s1", "run:1");
		guard.classify("s1", "run:1");
		guard.record("s1", "run:1");
		guard.classify("s1", "run:1"); // wedged
		expect(guard.classify("s1", "run:1")).toBe("suppress");
	});

	test("clearSession resets the session's budget", () => {
		const guard = new DispatchGuard();
		guard.record("s1", "run:1");
		guard.classify("s1", "run:1");
		guard.record("s1", "run:1");
		guard.clearSession("s1");
		expect(guard.classify("s1", "run:1")).toBe("new");
	});

	test("clear resets everything", () => {
		const guard = new DispatchGuard();
		guard.record("s1", "run:1");
		guard.record("s2", "run:1");
		guard.clear();
		expect(guard.classify("s1", "run:1")).toBe("new");
		expect(guard.classify("s2", "run:1")).toBe("new");
	});

	test("sessions are independent", () => {
		const guard = new DispatchGuard();
		guard.record("s1", "run:1");
		expect(guard.classify("s2", "run:1")).toBe("new");
	});
});
