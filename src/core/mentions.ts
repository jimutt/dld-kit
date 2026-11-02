/** How strongly a record's body ties it to a decision it mentions. */
export type MentionTier = "explicit" | "cue" | "mention";

export type Relation = "amends" | "supersedes";

export interface StatedRelation {
  id: string;
  relation: Relation;
}

const ID = /DL-\d+/g;
const RELATION_WORD = /\b(amends|supersedes)\b/gi;
const CHANGE_CUE =
  /\b(?:replac|supersed|amend|extend|overrid|relax|narrow|revert)\w*|\bno longer\b|\binstead of\b/i;
const CUE_SECTIONS = new Set(["decision", "consequences"]);
const SENTENCE_END = /(?<=[.;:!?])\s+/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const CODE_SPAN = /(`+)[^\n]*?\1/g;
const QUOTED = /"[^"\n]*"|“[^”\n]*”/g;
const HEADING = /^##[ \t]+(.*?)[ \t#]*$/;
const RANK: Record<MentionTier, number> = { mention: 0, cue: 1, explicit: 2 };

const ids = (text: string): string[] => text.match(ID) ?? [];

interface Sentence {
  section: string;
  text: string;
}

/**
 * The body's prose sentences, each with the `##` section it sits in (lower case, "" before
 * the first heading). Fenced code blocks, inline code spans and quoted text are left out.
 */
function sentences(body: string): Sentence[] {
  const out: Sentence[] = [];
  let section = "";
  let fence: string | undefined;
  for (const line of body.split(/\r?\n/)) {
    const marker = FENCE.exec(line)?.[1];
    if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    if (marker !== undefined) {
      fence = marker;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading !== null) {
      section = (heading[1] ?? "").trim().toLowerCase();
      continue;
    }
    for (const text of line.replace(CODE_SPAN, "").replace(QUOTED, "").split(SENTENCE_END)) {
      if (text.trim() !== "") out.push({ section, text });
    }
  }
  return out;
}

/** Removes parenthesised text, innermost first. */
function withoutParentheses(text: string): string {
  let current = text;
  for (;;) {
    const next = current.replace(/\([^()]*\)/g, "");
    if (next === current) return current;
    current = next;
  }
}

/**
 * Relationships one sentence states: every ID after "amends" or "supersedes", up to the next
 * such word, outside parentheses. None when a decision ID comes before the first one, since
 * another decision is then the subject.
 */
function sentenceRelations(text: string): StatedRelation[] {
  const words = [...text.matchAll(RELATION_WORD)];
  const first = words[0];
  if (first === undefined || ids(text.slice(0, first.index)).length > 0) return [];
  return words.flatMap((word, i) => {
    const start = word.index + word[0].length;
    const end = words[i + 1]?.index ?? text.length;
    const relation: Relation = word[0].toLowerCase() === "amends" ? "amends" : "supersedes";
    return ids(withoutParentheses(text.slice(start, end))).map((id) => ({ id, relation }));
  });
}

// @decision(DL-082)
/** The relationships a record's body states in so many words, in order, without repeats. */
export function statedRelations(body: string): StatedRelation[] {
  const seen = new Set<string>();
  const out: StatedRelation[] = [];
  for (const { text } of sentences(body)) {
    for (const stated of sentenceRelations(text)) {
      if (seen.has(stated.id)) continue;
      seen.add(stated.id);
      out.push(stated);
    }
  }
  return out;
}

// @decision(DL-082)
/** Every decision ID a record's body mentions, with the strongest tier it reaches. */
export function mentionTiers(body: string): Map<string, MentionTier> {
  const tiers = new Map<string, MentionTier>();
  const raise = (id: string, tier: MentionTier) => {
    const current = tiers.get(id);
    if (current === undefined || RANK[tier] > RANK[current]) tiers.set(id, tier);
  };
  for (const id of ids(body)) raise(id, "mention");
  for (const { section, text } of sentences(body)) {
    for (const { id } of sentenceRelations(text)) raise(id, "explicit");
    if (CUE_SECTIONS.has(section) && CHANGE_CUE.test(text)) {
      for (const id of ids(text)) raise(id, "cue");
    }
  }
  return tiers;
}
