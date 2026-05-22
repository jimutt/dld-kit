// dld_signal custom tool registration.
//
// Registered only when a DLD project is loaded (silent no-op in
// non-DLD repos — same pattern as autocomplete/guardrail features).
//
// Writes to the per-session SignalStore (owned by the composer) and
// emits an audit JSONL entry via pi.appendEntry so the signal stream
// survives /reload and is inspectable post-hoc.
//

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { SignalStore } from "../core/signal-store.ts";

/** Resolves to the per-session SignalStore, or null when no DLD project. */
export type GetSignalStore = () => SignalStore | null;

/**
 * Returned to the agent on every non-blocked emit. Explicitly closes
 * the loop so the agent doesn't loop back to check whether the human
 * has responded — the channel is async by contract.
 */
const CONTINUE_TEXT =
	"Signal recorded. Continue with your current task; the human will surface anything that needs your attention via chat. Do not poll back to check for a response.";

/**
 * Stub return for `blocked` signals — step 6 will replace this with
 * a real awaitable that resolves on the user's panel response. For
 * now, agent gets a clear placeholder so the contract is honest.
 */
const BLOCKED_STUB_TEXT =
	"Signal recorded with kind=blocked. (Synchronous human-response routing is not yet wired in this build; the human has been notified via the side panel and will respond via chat. Treat this as a soft pause: wait for their input before continuing.)";

const ParamsSchema = Type.Object(
	{
		kind: StringEnum([
			"progress",
			"review",
			"amend-needed",
			"review-skipped",
			"question",
			"blocked",
		] as const),
		title: Type.String({
			minLength: 1,
			maxLength: 120,
			description:
				"One-line summary that will show in the side panel. Keep it scannable; detail goes in `detail`.",
		}),
		detail: Type.Optional(
			Type.String({
				maxLength: 2000,
				description:
					"Multi-line markdown elaboration shown when the human expands the signal. Optional.",
			}),
		),
		decisionRef: Type.Optional(
			Type.String({
				pattern: "^DL-\\d+$",
				description:
					"Decision id this signal relates to, e.g. DL-218. Lets the panel link to the decision card.",
			}),
		),
		urgency: Type.Optional(
			StringEnum(["info", "review", "act-now"] as const, {
				description:
					"Override the default urgency for this kind. Use only when the kind's default is wrong (e.g. a `progress` event that's actually a milestone worth highlighting).",
			}),
		),
		suggestedAction: Type.Optional(
			Type.String({
				maxLength: 200,
				description:
					"One-line hint to the human about what action would make sense, e.g. 'Pick A or B in panel' or 'Open /dld-decide to amend'.",
			}),
		),
	},
	{ additionalProperties: false },
);

/**
 * Register the dld_signal tool. Idempotent guard via a module-scoped
 * flag — Pi will throw on duplicate registration if session_start
 * fires twice for any reason.
 */
let registered = false;

export default function signalTool(
	pi: ExtensionAPI,
	deps: { getSignalStore: GetSignalStore },
): void {
	if (registered) return;
	registered = true;

	pi.registerTool({
		name: "dld_signal",
		label: "DLD signal",
		description: [
			"Emit a structured signal to the human supervisor's side panel,",
			"without blocking your turn. Use this during long /dld-plan or",
			"/dld-implement runs to surface things the human should glance",
			"at but does not need to respond to synchronously.",
			"",
			"Signal kinds:",
			"  • progress       — passive milestones ('did X')",
			"  • review         — soft 'look at this when you can'",
			"  • amend-needed   — 'I think we should revisit DL-N before/after'",
			"  • review-skipped — audit trail when you decline reviewer feedback",
			"  • question       — 'two valid options, picking default unless told'",
			"  • blocked        — you literally cannot continue without input",
			"",
			"Default behavior is fire-and-forget — emit and immediately",
			"continue your task. Only `blocked` implies you should stop.",
		].join("\n"),
		promptSnippet:
			"Surface side-channel signals to the human supervisor (progress, review, amend-needed, blocked, etc.) without blocking your turn.",
		promptGuidelines: [
			"Use dld_signal throughout long /dld-plan and /dld-implement runs to keep the human supervisor's side panel useful — emit at phase transitions (kind='progress') and at every choice with a trade-off (kind='review' for choices, kind='amend-needed' for stale existing decisions, kind='review-skipped' for declined reviewer findings). Don't restrict emission to one step of the skill; emit when the work happens.",
			"Lean toward emitting. Cost of an unneeded signal is low (human ignores it); cost of not emitting is high (human can't see what wasn't shared). A planning or implementation run with multiple non-trivial steps that emits zero signals has almost certainly under-shared.",
			"Use dld_signal with kind='blocked' only when you genuinely cannot continue without human input — all other kinds are fire-and-forget; emit and continue.",
		],
		parameters: ParamsSchema,

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const store = deps.getSignalStore();
			if (!store) {
				// Non-DLD project: tool shouldn't be registered at all
				// (we gate registration in the composer), but if it is
				// somehow reached, fail loudly so we notice.
				return {
					content: [
						{
							type: "text",
							text: "Error: dld_signal called in a non-DLD project. This tool requires dld.config.yaml in the repo root.",
						},
					],
					details: { error: "no-store" },
				};
			}

			const sig = store.add({
				kind: params.kind,
				title: params.title,
				detail: params.detail,
				decisionRef: params.decisionRef,
				urgency: params.urgency,
				suggestedAction: params.suggestedAction,
			});

			// Audit log — survives /reload, inspectable after the fact.
			pi.appendEntry("dld-signal", sig);

			const text =
				sig.kind === "blocked" ? BLOCKED_STUB_TEXT : CONTINUE_TEXT;

			return {
				content: [
					{
						type: "text",
						text: `${text}\n\n(id: ${sig.id} · urgency: ${sig.urgency})`,
					},
				],
				details: { signal: sig },
			};
		},
	});
}

/**
 * Exposed for tests so we can re-register against a fresh fake
 * ExtensionAPI between cases without the module-scoped guard
 * tripping.
 */
export function __resetForTests(): void {
	registered = false;
}
