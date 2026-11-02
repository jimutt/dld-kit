/** How strongly a record's body ties it to a decision it mentions. */
export type MentionTier = "explicit" | "cue" | "mention";

export type Relation = "amends" | "supersedes";

export interface StatedRelation {
  id: string;
  relation: Relation;
}

const ID = /DL-\d+/g;
const RELATION_WORD = /(?<![\w-])(amends|supersedes)\b/gi;
const SUBJECT = /DL-\d+(?:'s)?\s*$/;
const CHANGE_CUE =
  /\b(?:replac|supersed|amend|extend|overrid|relax|narrow|revert)\w*|\bno longer\b|\binstead of\b/i;
const CUE_SECTIONS = new Set(["decision", "consequences"]);
const SENTENCE_END = /(?<=[.;:!?])\s+/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const CODE_SPAN = /(`+)[^\n]*?\1/g;
const QUOTED = /"[^"\n]*"|“[^”\n]*”/g;
const HEADING = /^##[ \t]+(.*?)[ \t#]*$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;
const RANK: Record<MentionTier, number> = { mention: 0, cue: 1, explicit: 2 };

const ids = (text: string): string[] => text.match(ID) ?? [];

interface Sentence {
  section: string;
  /** The line is a list item. */
  item: boolean;
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
  for (const text of body.split(/\r?\n/)) {
    const marker = FENCE.exec(text)?.[1];
    if (fence !== undefined) {
      // A closing fence has nothing after its marker.
      const closes =
        marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length;
      if (closes && text.trim() === marker) fence = undefined;
      continue;
    }
    if (marker !== undefined) {
      fence = marker;
      continue;
    }
    const heading = HEADING.exec(text);
    if (heading !== null) {
      section = (heading[1] ?? "").trim().toLowerCase();
      continue;
    }
    const item = LIST_ITEM.test(text);
    for (const part of text.replace(CODE_SPAN, "").replace(QUOTED, "").split(SENTENCE_END)) {
      if (part.trim() !== "") out.push({ section, item, text: part });
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

const relationOf = (word: string): Relation =>
  word.toLowerCase() === "amends" ? "amends" : "supersedes";

interface SentenceRelations {
  /** The sentence has an "amends" or "supersedes" outside parentheses. */
  hasWord: boolean;
  relations: StatedRelation[];
  /** The sentence ends in "amends:" or "supersedes:", introducing the IDs that follow. */
  opens?: Relation;
}

/**
 * Relationships one sentence states, outside parentheses: the IDs after each "amends" or
 * "supersedes", up to the next one. A word with a decision ID as its subject, right before
 * it, states nothing, and neither does a sentence with any ID before its first such word.
 */
function sentenceRelations(text: string): SentenceRelations {
  const prose = withoutParentheses(text);
  const words = [...prose.matchAll(RELATION_WORD)];
  const first = words[0];
  if (first === undefined) return { hasWord: false, relations: [] };
  if (ids(prose.slice(0, first.index)).length > 0) return { hasWord: true, relations: [] };
  const relations: StatedRelation[] = [];
  let opens: Relation | undefined;
  words.forEach((word, i) => {
    if (i > 0 && SUBJECT.test(prose.slice(0, word.index))) return;
    const start = word.index + word[0].length;
    const next = words[i + 1];
    let end = prose.length;
    if (next !== undefined) {
      const subject = SUBJECT.exec(prose.slice(start, next.index));
      end = subject === null ? next.index : start + subject.index;
    }
    const relation = relationOf(word[0]);
    const found = ids(prose.slice(start, end));
    for (const id of found) relations.push({ id, relation });
    if (next === undefined && found.length === 0 && prose.trimEnd().endsWith(":")) {
      opens = relation;
    }
  });
  return { hasWord: true, relations, ...(opens === undefined ? {} : { opens }) };
}

interface Stated {
  sentence: Sentence;
  relations: StatedRelation[];
}

/**
 * Each sentence with the relationships it states. A sentence ending in "amends:" passes its
 * relation to the next sentence in its section, or, when that sentence is a list item, to
 * every item of that list.
 */
function statedBySentence(body: string): Stated[] {
  const out: Stated[] = [];
  let open: { relation: Relation; section: string; list: boolean } | undefined;
  for (const sentence of sentences(body)) {
    if (
      open !== undefined &&
      (open.section !== sentence.section || (open.list && !sentence.item))
    ) {
      open = undefined;
    }
    const own = sentenceRelations(sentence.text);
    if (own.opens !== undefined) {
      open = { relation: own.opens, section: sentence.section, list: false };
      out.push({ sentence, relations: own.relations });
    } else if (open !== undefined && !own.hasWord) {
      const { relation } = open;
      const relations = ids(withoutParentheses(sentence.text)).map((id) => ({ id, relation }));
      out.push({ sentence, relations });
      open = sentence.item ? { ...open, list: true } : undefined;
    } else {
      out.push({ sentence, relations: own.relations });
      if (open !== undefined && !open.list) open = undefined;
    }
  }
  return out;
}

// @decision(DL-082)
/** The relationships a record's body states in so many words, in order, without repeats. */
export function statedRelations(body: string): StatedRelation[] {
  const seen = new Set<string>();
  const out: StatedRelation[] = [];
  for (const { relations } of statedBySentence(body)) {
    for (const stated of relations) {
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
  for (const { sentence, relations } of statedBySentence(body)) {
    for (const { id } of relations) raise(id, "explicit");
    if (CUE_SECTIONS.has(sentence.section) && CHANGE_CUE.test(sentence.text)) {
      for (const id of ids(sentence.text)) raise(id, "cue");
    }
  }
  return tiers;
}
