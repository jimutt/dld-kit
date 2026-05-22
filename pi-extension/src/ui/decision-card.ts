// Shared TUI renderer for the `dld-guardrail` custom message type.
// Collapsed by default, Tab-to-expand. Reused by plan 03 (ambient
// widget) and plan 05 (audit-outcomes panel).
//
// Implementation lands as part of plan 02.

export const STATUS_GLYPHS: Record<string, string> = {
	proposed: "◐",
	accepted: "●",
	superseded: "⊘",
	deprecated: "∅",
};
