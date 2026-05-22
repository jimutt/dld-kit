import { afterEach, describe, expect, test } from "bun:test";
import { SignalStore } from "../src/core/signal-store.ts";
import signalTool, { __resetForTests } from "../src/features/signal-tool.ts";

/**
 * Minimal fake ExtensionAPI surface — just enough for signal-tool's
 * registerTool + appendEntry calls. Captures the registered tool def
 * so tests can invoke `execute` directly without spinning up a real Pi.
 */
type ToolDef = {
	name: string;
	description: string;
	parameters: unknown;
	execute: (
		toolCallId: string,
		params: Record<string, unknown>,
		signal: AbortSignal,
		onUpdate: ((u: unknown) => void) | undefined,
		ctx: unknown,
	) => Promise<{
		content: { type: string; text: string }[];
		details?: unknown;
	}>;
};

function fakePi() {
	let registeredTool: ToolDef | null = null;
	const appendedEntries: { type: string; data: unknown }[] = [];
	const pi = {
		registerTool: (def: ToolDef) => {
			registeredTool = def;
		},
		appendEntry: (type: string, data: unknown) => {
			appendedEntries.push({ type, data });
		},
	};
	return {
		// biome-ignore lint/suspicious/noExplicitAny: ExtensionAPI is too broad to mock fully
		pi: pi as any,
		getTool: () => registeredTool!,
		getAppended: () => appendedEntries,
	};
}

async function callTool(
	tool: ToolDef,
	params: Record<string, unknown>,
): Promise<{ content: { type: string; text: string }[]; details?: unknown }> {
	const ac = new AbortController();
	return tool.execute("call-1", params, ac.signal, undefined, {});
}

afterEach(() => {
	__resetForTests();
});

describe("signal-tool registration", () => {
	test("registers a tool named dld_signal", () => {
		const { pi, getTool } = fakePi();
		const store = new SignalStore();
		signalTool(pi, { getSignalStore: () => store });
		expect(getTool().name).toBe("dld_signal");
	});

	test("description mentions all six signal kinds", () => {
		const { pi, getTool } = fakePi();
		const store = new SignalStore();
		signalTool(pi, { getSignalStore: () => store });
		const desc = getTool().description;
		for (const k of [
			"progress",
			"review",
			"amend-needed",
			"review-skipped",
			"question",
			"blocked",
		]) {
			expect(desc).toContain(k);
		}
	});

	test("is idempotent: second call is a no-op (single registration)", () => {
		const { pi } = fakePi();
		const store = new SignalStore();
		let count = 0;
		pi.registerTool = () => {
			count += 1;
		};
		signalTool(pi, { getSignalStore: () => store });
		signalTool(pi, { getSignalStore: () => store });
		expect(count).toBe(1);
	});
});

describe("signal-tool execute -> SignalStore", () => {
	test("non-blocked emit returns CONTINUE_TEXT and writes to store", async () => {
		const { pi, getTool, getAppended } = fakePi();
		const store = new SignalStore();
		signalTool(pi, { getSignalStore: () => store });

		const result = await callTool(getTool(), {
			kind: "review",
			title: "Concurrency choice in DL-220",
			detail: "Why 8 over 4 — see Open questions §3",
			decisionRef: "DL-220",
		});

		expect(store.list()).toHaveLength(1);
		const recorded = store.list()[0]!;
		expect(recorded.kind).toBe("review");
		expect(recorded.urgency).toBe("review"); // default for kind
		expect(recorded.decisionRef).toBe("DL-220");

		const text = result.content[0]!.text;
		expect(text).toContain("Continue with your current task");
		expect(text).toContain(recorded.id); // id surfaced for traceability
		expect(text).toContain("urgency: review");

		// Audit JSONL write
		expect(getAppended()).toHaveLength(1);
		expect(getAppended()[0]!.type).toBe("dld-signal");
	});

	test("blocked emit returns the BLOCKED_STUB_TEXT (placeholder until step 6)", async () => {
		const { pi, getTool } = fakePi();
		const store = new SignalStore();
		signalTool(pi, { getSignalStore: () => store });

		const result = await callTool(getTool(), {
			kind: "blocked",
			title: "Cannot pick between A and B",
		});

		const text = result.content[0]!.text;
		expect(text).toContain("kind=blocked");
		expect(text).toContain("not yet wired");
		expect(text).toContain("Treat this as a soft pause");
		// And the store still recorded it
		expect(store.list()[0]!.kind).toBe("blocked");
		expect(store.list()[0]!.urgency).toBe("act-now");
	});

	test("urgency override on params reaches the store", async () => {
		const { pi, getTool } = fakePi();
		const store = new SignalStore();
		signalTool(pi, { getSignalStore: () => store });

		await callTool(getTool(), {
			kind: "progress",
			title: "milestone",
			urgency: "review",
		});

		expect(store.list()[0]!.urgency).toBe("review");
	});

	test("details on the tool result include the signal record", async () => {
		const { pi, getTool } = fakePi();
		const store = new SignalStore();
		signalTool(pi, { getSignalStore: () => store });

		const result = await callTool(getTool(), {
			kind: "amend-needed",
			title: "DL-218 rationale is stale",
			decisionRef: "DL-218",
		});

		expect(result.details).toBeDefined();
		const details = result.details as { signal: { id: string; kind: string } };
		expect(details.signal.kind).toBe("amend-needed");
		expect(details.signal.id).toBe("sig-0001");
	});

	test("no-store guard returns a clear error (defense in depth)", async () => {
		const { pi, getTool } = fakePi();
		signalTool(pi, { getSignalStore: () => null });

		const result = await callTool(getTool(), {
			kind: "progress",
			title: "x",
		});

		expect(result.content[0]!.text).toContain("non-DLD project");
	});
});
