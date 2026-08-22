import type { RunState, WorkItem } from "./run-state.ts";

// @decision(DL-011)
// Pure rendering: every function takes run state and returns plain strings.
// Nothing here touches pi, the filesystem, or the terminal — the wiring in
// index.ts maps these onto setStatus, setWidget, and appendEntry. The widget
// height is fixed at five lines regardless of run size; that invariance is
// the protection against the pi-goal-x scrollback failure and is covered by
// render.test.ts.

const WIDGET_HEIGHT = 5;

function elapsedLabel(state: RunState, activeMinutes?: number): string {
	// Active time is what the bound measures; wall-clock since creation counts
	// overnight pauses, which is why a resumed run showed 703m of nothing.
	const elapsedMin = activeMinutes ?? Math.max(0, (Date.now() - Date.parse(state.createdAt)) / 60000);
	if (state.bounds.maxMinutes > 0) {
		return `${Math.floor(elapsedMin)}m/${state.bounds.maxMinutes}m`;
	}
	return `${Math.floor(elapsedMin)}m`;
}

function decisionIds(item: WorkItem): string {
	return item.decisions.map((d) => d.id).join(" ");
}

function itemIcon(status: WorkItem["status"]): string {
	switch (status) {
		case "accepted": return "✔";
		case "skipped": return "–";
		case "implementing":
		case "verifying": return "▸";
		case "blocked":
		case "failed": return "✖";
		default: return "○";
	}
}

export function statusLine(state: RunState, activeMinutes?: number): string {
	const total = state.items.length;
	const done = state.items.filter((i) => i.status === "accepted" || i.status === "skipped").length;
	const current = state.currentItem !== null ? state.items.find((i) => i.index === state.currentItem) : undefined;
	const currentBit = current ? ` · ${decisionIds(current)} ${current.status}` : "";
	const blockedCount = state.blockedQuestions.filter((q) => !q.answer).length;
	const blockedBit = blockedCount > 0 ? ` · ${blockedCount} blocked question${blockedCount === 1 ? "" : "s"}` : "";
	return `◆ ${state.slug} ${done}/${total}${currentBit} · ${elapsedLabel(state, activeMinutes)}${blockedBit}`;
}

/**
 * The item window: always exactly WIDGET_HEIGHT lines. One or two completed
 * items for context, the current item, the next pending item or two, and a
 * "+N more" line when items fall outside the window. A 3-item run and a
 * 30-item run render the same number of lines.
 */
export function widgetLines(state: RunState, activeMinutes?: number): string[] {
	const items = state.items;
	const total = items.length;
	const done = items.filter((i) => i.status === "accepted" || i.status === "skipped").length;
	const header = `dld-goal ${state.slug} ─── ${done}/${total} · ${elapsedLabel(state, activeMinutes)}`;

	if (total === 0) {
		return [header, "  no items yet", "", "", ""];
	}

	const currentIdx = state.currentItem !== null
		? items.findIndex((i) => i.index === state.currentItem)
		: items.findIndex((i) => i.status === "pending");
	const anchor = currentIdx >= 0 ? currentIdx : 0;

	// Window: one item before the anchor, the anchor, items after — but never
	// more than will fit with the header and the "more" line, which is
	// reserved whenever anything is hidden.
	const before = Math.max(0, anchor - 1);
	let windowItems = items.slice(before, anchor + 3);
	let hiddenAfter = total - (before + windowItems.length);
	const reserveMore = before > 0 || hiddenAfter > 0;
	const maxWindow = WIDGET_HEIGHT - 1 - (reserveMore ? 1 : 0);
	if (windowItems.length > maxWindow) {
		windowItems = windowItems.slice(0, maxWindow);
		hiddenAfter = total - (before + windowItems.length);
	}

	const lines = [header];
	for (const item of windowItems) {
		const ids = decisionIds(item);
		const label = `${itemIcon(item.status)} ${item.index}  ${ids || "—"}`;
		const right = item.status === "accepted" ? "accepted" : item.status;
		lines.push(`  ${label.padEnd(28)} ${right}`);
	}
	while (lines.length < WIDGET_HEIGHT - (reserveMore ? 1 : 0)) lines.push("");
	if (reserveMore) {
		const more = [
			before > 0 ? `+${before} before` : "",
			hiddenAfter > 0 ? `+${hiddenAfter} more` : "",
		].filter(Boolean).join(" · ");
		lines.push(`  ${more}`);
	}
	return lines.slice(0, WIDGET_HEIGHT);
}

/** Full board content for the overlay. No height cap — scrollback is free here. */
export function boardLines(state: RunState): string[] {
	const lines: string[] = [
		`dld-goal board — ${state.slug}`,
		`status: ${state.status} · created ${state.createdAt} · ${elapsedLabel(state)}`,
		`bounds: ${state.bounds.maxItems || "∞"} items · ${state.bounds.maxMinutes || "∞"} minutes · review ${state.review}`,
		"",
	];
	if (state.items.length === 0) lines.push("  no items");
	for (const item of state.items) {
		lines.push(`${itemIcon(item.status)} item ${item.index} · ${decisionIds(item) || "—"} · ${item.status} · attempts ${item.attempts}`);
		for (const ev of item.evidence) {
			lines.push(`    ${typeof ev === "string" ? ev : JSON.stringify(ev)}`);
		}
	}
	if (state.blockedQuestions.length > 0) {
		lines.push("", "questions:");
		for (const q of state.blockedQuestions) {
			lines.push(`  ${q.answer ? "✔" : "?"} item ${q.itemIndex}: ${q.question}${q.answer ? ` — ${q.answer}` : ""}`);
		}
	}
	lines.push("", "esc to close");
	return lines;
}
