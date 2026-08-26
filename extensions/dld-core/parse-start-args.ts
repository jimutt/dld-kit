// @decision(DL-022)
// The tolerant start syntax, shared by every harness. The agent is the
// parser: ranges expand, slug and title are derived when not given.
//
//   start DL-014..DL-022          → slug dl-014-022, 9 items
//   start DL-014 - DL-022         → same
//   start my-batch DL-014 DL-015  → slug my-batch, 2 items
//   start my-batch --decisions DL-014,DL-015

export interface StartArgs {
	slug: string;
	title: string;
	decisionIds: string[];
}

export function parseStartArgs(tokens: string[]): StartArgs | { error: string } {
	if (tokens.length === 0) {
		return { error: "Usage: /dld-run start <DL-NNN..DL-NNN | slug [title] decisions…>" };
	}

	// Range form: DL-014..DL-022 or DL-014 - DL-022 (spaces tolerated).
	const joined = tokens.join(" ");
	const rangeMatch = joined.match(/^(DL-\d+)\s*(?:\.\.|-|–|—|to)\s*(DL-\d+)$/i);
	if (rangeMatch) {
		const from = Number(rangeMatch[1]!.slice(3));
		const to = Number(rangeMatch[2]!.slice(3));
		if (!Number.isInteger(from) || !Number.isInteger(to) || from > to || to - from > 50) {
			return { error: `Invalid range: ${rangeMatch[1]}..${rangeMatch[2]}` };
		}
		const ids = Array.from({ length: to - from + 1 }, (_, i) => `DL-${String(from + i).padStart(3, "0")}`);
		return {
			slug: `dl-${String(from).padStart(3, "0")}-${String(to).padStart(3, "0")}`,
			title: `${rangeMatch[1]} through ${rangeMatch[2]}`,
			decisionIds: ids,
		};
	}

	const decisionFlag = tokens.indexOf("--decisions");
	let decisionIds: string[];
	let titleParts: string[];
	let slugSource: string | undefined;

	if (decisionFlag >= 0) {
		// --decisions as the first token has no slug — don't let the flag
		// itself become one.
		decisionIds = (tokens[decisionFlag + 1] ?? "").split(",").filter(Boolean);
		titleParts = tokens.slice(1, decisionFlag);
		slugSource = decisionFlag === 0 ? undefined : tokens[0];
	} else {
		// When the first token is a decision ID there is no explicit slug —
		// every positional token is a decision.
		const firstIsDecision = /^DL-\d+$/.test(tokens[0] ?? "");
		const source = firstIsDecision ? tokens : tokens.slice(1);
		decisionIds = source.filter((p) => /^DL-\d+$/.test(p));
		titleParts = source.filter((p) => !/^DL-\d+$/.test(p));
		slugSource = firstIsDecision ? undefined : tokens[0];
	}

	if (decisionIds.length === 0) {
		return { error: "A run needs decisions. Try /dld-run start DL-014..DL-022 or /dld-run start my-batch DL-014 DL-015" };
	}

	const slug =
		slugSource ??
		`dl-${decisionIds[0]!.slice(3).padStart(3, "0")}-${decisionIds[decisionIds.length - 1]!.slice(3).padStart(3, "0")}`;
	const title = titleParts.join(" ") || (slugSource ?? `${decisionIds[0]} batch`);
	return { slug, title, decisionIds };
}
