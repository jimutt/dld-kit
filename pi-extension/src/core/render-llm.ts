// Renders decisions into the text format the LLM sees when the
// pre-edit guardrail fuses content into `read` results or sends a steer
// message on `edit` / `write`.
//
// Format goals: scannable, unambiguous, cheap to produce, no markdown
// header conflicts with the decision body's own structure (which already
// uses `## Context`, `## Decision`, etc).
//

import type { Decision, DecisionStatus } from "./decision-index.ts";

export type DecisionForInjection = {
	decision: Decision;
	/** ID of the decision that supersedes this one, if any (added inline). */
	supersededBy?: string;
};

/**
 * Status-aware DLD methodology hint appended after each fused decision.
 *
 * Without this, the agent receives decision *content* but not the DLD
 * workflow *contract*. Caught during dogfooding (2026-05-19): a strict-
 * mode block correctly stopped the agent from contradicting an accepted
 * decision, and the agent then recommended `/dld-adjust` to revise it —
 * but `/dld-adjust` is only valid for `proposed` decisions; `accepted`
 * decisions are immutable and must be superseded or amended via a new
 * `/dld-decide`. The fix is to ship the methodology rule alongside the
 * decision text so the agent reaches for the right tool.
 *
 * ~50 tokens per decision injected. Cheap insurance for a non-obvious
 * rule the skill `SKILL.md` files carry but which isn't always loaded
 * into context alongside the decision data.
 */
function methodologyHint(
	status: DecisionStatus,
	id: string,
	supersededBy?: string,
): string {
	switch (status) {
		case "proposed":
			return (
				`→ **proposed** decisions are mutable while not yet implemented. ` +
				`Use \`/dld-adjust ${id}\` to refine it before/during implementation. ` +
				`Use \`/dld-implement ${id}\` to mark it accepted once the code is in place.`
			);
		case "accepted":
			return (
				`→ **accepted** decisions are immutable — their content is part of ` +
				`the project's history and must not be edited. To change behavior ` +
				`${id} governs, record a NEW decision via \`/dld-decide\` that ` +
				`explicitly supersedes (full replacement) or amends (partial update) ` +
				`${id}. Do NOT use \`/dld-adjust\` on accepted decisions.`
			);
		case "superseded":
			return supersededBy
				? `→ **superseded** by ${supersededBy} — prefer the successor for ` +
						`current behavior. ${id} is kept for historical context only.`
				: `→ **superseded** — no longer in force. Find the successor decision ` +
						`before relying on ${id}.`;
		case "deprecated":
			return (
				`→ **deprecated** — ${id} is retired with no replacement. ` +
				`Confirm with the user before treating this as guidance.`
			);
	}
}

/**
 * Render a single decision as compact text suitable for fusing into a
 * tool result or a steer message. Returns the markdown body verbatim
 * after a metadata header, then a status-aware methodology hint.
 */
export function renderDecisionForLLM(
	d: Decision,
	opts: { noteSupersedeOf?: string } = {},
): string {
	const date = d.timestamp ? d.timestamp.slice(0, 10) : "";
	const headerBits = [d.id, d.status, date].filter(Boolean).join(" · ");

	const meta: string[] = [];
	meta.push(`=== ${headerBits} ===`);
	meta.push(`Title: ${d.title}`);
	if (d.tags.length) meta.push(`Tags: ${d.tags.join(", ")}`);
	if (d.supersedes.length) meta.push(`Supersedes: ${d.supersedes.join(", ")}`);
	if (d.amends.length) meta.push(`Amends: ${d.amends.join(", ")}`);
	if (opts.noteSupersedeOf) {
		meta.push(`Note: superseded by ${opts.noteSupersedeOf} — consider that decision instead.`);
	}

	const body = (d.body ?? "").trim();
	const hint = methodologyHint(d.status, d.id, opts.noteSupersedeOf);
	const metaText = meta.join("\n");
	return body ? `${metaText}\n\n${body}\n\n${hint}` : `${metaText}\n\n${hint}`;
}

/**
 * Render the full injection block appended to a `read` result (or sent
 * as a steer message body). One block per touched file; one decision per
 * block entry.
 */
export function renderInjectionBlock(
	file: string,
	decisions: DecisionForInjection[],
	unknownIds: string[],
): string {
	const parts: string[] = ["", "---", `# DLD: decisions for ${file}`, ""];

	if (unknownIds.length) {
		parts.push(
			`> Note: ${unknownIds.join(", ")} referenced by an annotation in this file but not found in decisions/. Possible drift — consider running /dld-audit.`,
		);
		parts.push("");
	}

	for (const { decision, supersededBy } of decisions) {
		parts.push(renderDecisionForLLM(decision, { noteSupersedeOf: supersededBy }));
		parts.push("");
	}

	return parts.join("\n");
}
