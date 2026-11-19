// @decision(DL-093)
// The one module that knows how decision IDs are spelled, parsed and ordered. It imports
// nothing from core, so every other module can take its patterns from here.

/** Crockford base32, lower case: the characters of a timestamp ID after its `T`. */
export const BASE32_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
/** Characters of the time part and of the random part of a timestamp ID. */
export const TIME_CHARS = 7;
export const RANDOM_CHARS = 5;

const BASE32_CLASS = `[${BASE32_ALPHABET}]`;
const SEQUENTIAL_SOURCE = "DL-\\d+";
// @decision(DL-092)
const TIMESTAMP_SOURCE = `DL-T${BASE32_CLASS}{${TIME_CHARS + RANDOM_CHARS}}`;
// @decision(DL-094)
/** Where a timestamp ID ends in running text: not inside a longer lower-case run. */
const TIMESTAMP_END = "(?![0-9a-z])";
/**
 * A regex source for one decision ID of either form in running text. A sequential ID ends
 * where its digits end; a timestamp ID must not be followed by a lower-case letter or digit.
 */
export const ID_SOURCE = `(?:${TIMESTAMP_SOURCE}${TIMESTAMP_END}|${SEQUENTIAL_SOURCE})`;

const SEQUENTIAL_ID = /^DL-(\d+)$/;
const TIMESTAMP_ID = new RegExp(`^${TIMESTAMP_SOURCE}$`);
const RECORD_NAME = new RegExp(`^(${TIMESTAMP_SOURCE}|${SEQUENTIAL_SOURCE})\\.md$`);
// @decision(DL-099)
const RESERVED_NAME = new RegExp(`^(${TIMESTAMP_SOURCE}|${SEQUENTIAL_SOURCE})--.*\\.md$`);

export type ParsedId = { form: "sequential"; number: number } | { form: "timestamp"; key: string };

// @decision(DL-092) @decision(DL-093)
/** The form of a decision ID and its number or key, or undefined for anything else. */
export function parseId(id: string): ParsedId | undefined {
  const digits = SEQUENTIAL_ID.exec(id)?.[1];
  if (digits !== undefined) return { form: "sequential", number: Number.parseInt(digits, 10) };
  if (TIMESTAMP_ID.test(id)) return { form: "timestamp", key: id.slice(4) };
  return undefined;
}

/** True for a decision ID of either form, in any spelling commands accept when reading. */
export function isDecisionId(id: string): boolean {
  return parseId(id) !== undefined;
}

/** Every decision ID in `text`, in order, repeats included. */
export function findIds(text: string): string[] {
  return text.match(new RegExp(ID_SOURCE, "g")) ?? [];
}

// @decision(DL-094)
/** Matches `id` in running text where it is the whole ID, not the start of a longer one. */
export function idMatcher(id: string, flags = ""): RegExp {
  const end = parseId(id)?.form === "timestamp" ? TIMESTAMP_END : "(?![0-9])";
  return new RegExp(`${id}${end}`, flags);
}

// @decision(DL-094)
/** True for text that names a decision the way a mistyped annotation would. */
export function looksLikeId(text: string): boolean {
  return /dl-(?:\d|t\d)/i.test(text);
}

// @decision(DL-078)
export function formatId(n: number): string {
  return `DL-${String(n).padStart(3, "0")}`;
}

// @decision(DL-078) @decision(DL-092)
/**
 * True for an ID in its one canonical spelling: DL-001, DL-042, DL-1000 (not DL-5 or DL-0042),
 * or a timestamp ID.
 */
export function isCanonicalId(id: string): boolean {
  return /^DL-(\d{3}|[1-9]\d{3,})$/.test(id) || TIMESTAMP_ID.test(id);
}

// @decision(DL-078) @decision(DL-092)
/**
 * The canonical spelling of an ID written another way (`DL-5`, `dl-0042`, an upper-case
 * timestamp ID, one with `i`, `l` or `o`), when there is one.
 */
export function canonicalSpelling(id: string): string | undefined {
  const digits = /^dl-(\d+)$/i.exec(id)?.[1];
  if (digits !== undefined) {
    const number = Number(digits);
    return Number.isSafeInteger(number) ? formatId(number) : undefined;
  }
  const key = /^dl-t([0-9a-z]+)$/i.exec(id)?.[1];
  if (key === undefined) return undefined;
  const respelled = `DL-T${key.toLowerCase().replace(/[il]/g, "1").replace(/o/g, "0")}`;
  return TIMESTAMP_ID.test(respelled) ? respelled : undefined;
}

// @decision(DL-101)
/**
 * Text to append to an error about an ID that is not valid or not found: names the canonical
 * spelling when `id` is another spelling of a valid ID, and is empty otherwise.
 */
export function spellingHint(id: string): string {
  const canonical = canonicalSpelling(id);
  return canonical === undefined || canonical === id ? "" : ` Did you mean ${canonical}?`;
}

// @decision(DL-101)
/** The usage error text for arguments that are not decision IDs. */
export function notAnIdMessage(id: string | undefined, many = false): string {
  const expected = many
    ? "expected decision IDs like DL-001 or DL-T1k3m9z2p7xq4"
    : "expected one decision ID like DL-001 or DL-T1k3m9z2p7xq4";
  return id === undefined ? expected : `${expected}, got '${id}'.${spellingHint(id)}`;
}

const textOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// @decision(DL-093)
/**
 * Orders decision IDs: sequential IDs by number (the same number by text), then timestamp IDs
 * by text, then anything that is not a decision ID, by text.
 */
export function compareIds(a: string, b: string): number {
  const rank = (parsed: ParsedId | undefined) =>
    parsed === undefined ? 2 : parsed.form === "sequential" ? 0 : 1;
  const left = parseId(a);
  const right = parseId(b);
  if (left?.form === "sequential" && right?.form === "sequential") {
    return left.number - right.number || textOrder(a, b);
  }
  return rank(left) - rank(right) || textOrder(a, b);
}

// @decision(DL-096)
/**
 * What makes two record files the same decision: the number for a sequential ID, so `DL-07`
 * and `DL-007` clash, and the text for a timestamp ID.
 */
export function identityKey(id: string): string {
  const parsed = parseId(id);
  return parsed?.form === "sequential" ? `#${parsed.number}` : id;
}

// @decision(DL-099)
/** The ID a file name carries when it is a record file, `<id>.md`; undefined otherwise. */
export function recordFileId(name: string): string | undefined {
  return RECORD_NAME.exec(name)?.[1];
}

// @decision(DL-099)
/** The ID of a reserved `<id>--<text>.md` file name, which is not a record. */
export function reservedFileId(name: string): string | undefined {
  return RESERVED_NAME.exec(name)?.[1];
}

// @decision(DL-092)
/** `value` in base32, most significant character first, padded to `width` characters. */
function encodeBase32(value: number, width: number): string {
  let rest = value;
  let out = "";
  for (let i = 0; i < width; i++) {
    out = BASE32_ALPHABET.charAt(rest % 32) + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

// @decision(DL-092)
/**
 * The timestamp ID for a time in whole Unix seconds and a random number below 32^5. Both must
 * be non-negative integers that fit their part of the ID.
 */
export function timestampId(seconds: number, random: number): string {
  const fits = (value: number, chars: number) =>
    Number.isInteger(value) && value >= 0 && value < 32 ** chars;
  if (!fits(seconds, TIME_CHARS) || !fits(random, RANDOM_CHARS)) {
    throw new RangeError(`cannot make a timestamp ID from ${seconds} and ${random}`);
  }
  return `DL-T${encodeBase32(seconds, TIME_CHARS)}${encodeBase32(random, RANDOM_CHARS)}`;
}

// @decision(DL-092)
/** The time part of a timestamp ID in Unix seconds, or undefined for any other value. */
export function timestampSeconds(id: string): number | undefined {
  const parsed = parseId(id);
  if (parsed?.form !== "timestamp") return undefined;
  let seconds = 0;
  for (const char of parsed.key.slice(0, TIME_CHARS)) {
    seconds = seconds * 32 + BASE32_ALPHABET.indexOf(char);
  }
  return seconds;
}
