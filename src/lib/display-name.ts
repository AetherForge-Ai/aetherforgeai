/**
 * SEC-NAME-1 display-name policy (Lukas, 28 Nov 2026).
 * A dot-like mark next to a letter is rejected. The only exceptions are a
 * standalone initial ("J. Smith", "Wei K. Ng") and a title abbreviation
 * followed by a space ("Dr. Smith"). There is no TLD list.
 * Writes use validateDisplayName and refuse the save. Display uses
 * sanitizeDisplayName and shows "Member" for a stored name that fails.
 * Neither path rewrites existing rows by itself.
 */

export const DISPLAY_NAME_MAX = 40;
export const DISPLAY_NAME_FALLBACK = "Member";
export const DISPLAY_NAME_ERROR =
  "Names can't contain web addresses or dots between letters, except initials like J. Smith";

const NAME_KEYS = ["name", "first_name", "last_name", "firstName", "lastName"] as const;

/** ZWNJ and ZWJ stay. Persian and Devanagari use them. */
const KEEP_FORMAT = new Set([0x200c, 0x200d]);

const TITLES = new Set(["mr", "mrs", "ms", "dr", "jr", "sr", "st", "prof"]);

/**
 * Dot-like characters, by class, not a short allow-list of ASCII.
 * Anything whose NFKC form is "." is also a dot. U+00B7 and the rest below
 * do not all fold to "." under NFKC, so they are listed.
 */
const DOT_LIKE = new Set<number>([
  0x002e, // .
  0x00b7, // · middle dot
  0x2022, // • bullet
  0x2024, // one dot leader
  0x2027, // hyphenation point
  0x2e31, // word separator middle dot
  0x2e33, // raised dot
  0x0701, // syriac supralinear full stop
  0x0702, // syriac sublinear full stop
  0xa60e, // vai full stop
  0x10a50, // kharoshthi punctuation dot
  0x1427, // canadian syllabics final middle dot
  0xff0e, // ． fullwidth full stop
  0xfe52, // small full stop
  0x3002, // 。 ideographic full stop
  0xff61, // ｡ halfwidth ideographic full stop
  0x0589, // ։ armenian full stop
  0x06d4, // ۔ arabic full stop
  0x30fb, // ・ katakana middle dot
  0xff65, // ･ halfwidth katakana middle dot
  0x2219, // ∙ bullet operator
  0x22c5, // ⋅ dot operator
  0x02d9, // ˙ dot above
  0x0387, // greek ano teleia
  0xa4f8, // ꓸ lisu letter tone mya ti
]);

/** One-to-one confusables. Used only while checking, not as the stored letters. */
const CONFUSABLES: Record<string, string> = {
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y", "\u0445": "x",
  "\u0456": "i", "\u0455": "s", "\u0458": "j", "\u04bb": "h", "\u0501": "d", "\u051b": "q", "\u051d": "w",
  "\u0454": "e", "\u04cf": "l", "\u0473": "f", "\u0432": "b",
  "\u03b1": "a", "\u03b5": "e", "\u03bf": "o", "\u03c1": "p", "\u03b9": "i", "\u03ba": "k", "\u03bd": "n",
  "\u03c4": "t", "\u03c5": "u", "\u03b7": "n",
};

export class DisplayNameError extends Error {
  constructor(message = DISPLAY_NAME_ERROR) {
    super(message);
    this.name = "DisplayNameError";
  }
}

export type DisplayNameResult = { ok: true; name: string } | { ok: false; error: string };

function codePoints(value: string): string[] {
  return Array.from(value);
}

function isKeptFormat(cp: number): boolean {
  return KEEP_FORMAT.has(cp);
}

/** Controls, bidi, zero-width, variation selectors, and the R7 format characters. */
function isStrippedFormat(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  if (isKeptFormat(cp)) return false;
  if (cp === 0x034f || cp === 0x115f || cp === 0x1160 || cp === 0x3164 || cp === 0xffa0) return true;
  if (cp >= 0xfff9 && cp <= 0xfffb) return true;
  if (cp >= 0x0600 && cp <= 0x0605) return true;
  if (cp === 0x06dd || cp === 0x070f || cp === 0x110bd) return true;
  if (cp >= 0x13430 && cp <= 0x1343f) return true;
  if (cp === 0x2028 || cp === 0x2029) return true;
  return /\p{Default_Ignorable_Code_Point}|\p{Variation_Selector}|\p{Cc}/u.test(ch);
}

function caseFold(ch: string): string {
  const lower = ch.toLowerCase();
  return codePoints(lower).length === 1 ? lower : ch;
}

function isDotLike(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  if (DOT_LIKE.has(cp) || ch === ".") return true;
  const nfkc = ch.normalize("NFKC");
  return nfkc === "." || DOT_LIKE.has(nfkc.codePointAt(0) ?? 0);
}

function checkChar(ch: string): string {
  if (isDotLike(ch)) return ".";
  const folded = caseFold(ch);
  if (isDotLike(folded)) return ".";
  return CONFUSABLES[folded] ?? CONFUSABLES[ch] ?? folded;
}

function isLetter(ch: string): boolean {
  return /\p{L}/u.test(ch);
}

function prepare(value: string): string {
  const stripped = codePoints(value).filter((ch) => !isStrippedFormat(ch)).join("");
  const normalised = stripped.normalize("NFKC");
  return codePoints(normalised)
    .filter((ch) => !isStrippedFormat(ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWebAddress(view: string): boolean {
  if (view.includes("://") || view.includes("@")) return true;
  if (/(^|[^a-z0-9])www\./.test(view)) return true;
  if (/(^|\s)www(\s|$)/.test(view)) return true;
  if (/\b(?:javascript|vbscript|hxxps?)\s*:/.test(view)) return true;
  return false;
}

function hasSpelledDot(view: string): boolean {
  if (view.includes(" dot ")) return true;
  if (/\(\s*dot\s*\)/.test(view)) return true;
  if (/\[\s*dot\s*\]/.test(view)) return true;
  if (/\{\s*dot\s*\}/.test(view)) return true;
  if (/\(\s*\.\s*\)/.test(view)) return true;
  if (/\[\s*\.\s*\]/.test(view)) return true;
  if (/\{\s*\.\s*\}/.test(view)) return true;
  return false;
}

function nearestNonSpace(view: string[], index: number, dir: -1 | 1): string {
  let j = index + dir;
  while (j >= 0 && j < view.length && view[j] === " ") j += dir;
  return view[j] ?? "";
}

/**
 * Initial: a standalone single letter, then a dot, then a space or the end.
 * Title: Mr/Mrs/Ms/Dr/Jr/Sr/St/Prof, then a dot, then a space.
 */
function dotAllowed(view: string[], index: number): boolean {
  const next = view[index + 1] ?? "";
  if (next !== "" && next !== " ") return false;
  const prev = view[index - 1] ?? "";
  if (!isLetter(prev)) return false;
  let k = index - 1;
  let token = "";
  while (k >= 0 && isLetter(view[k])) {
    token = view[k] + token;
    k--;
  }
  if (k >= 0 && view[k] !== " ") return false;
  if (token.length === 1) return true;
  return TITLES.has(token) && next === " ";
}

function hasIllegalDot(view: string[]): boolean {
  for (let i = 0; i < view.length; i++) {
    if (view[i] !== ".") continue;
    if (dotAllowed(view, i)) continue;
    const left = nearestNonSpace(view, i, -1);
    const right = nearestNonSpace(view, i, 1);
    if (isLetter(left) || isLetter(right)) return true;
  }
  return false;
}

function violates(cleaned: string): boolean {
  const view = codePoints(cleaned).map(checkChar);
  const text = view.join("");
  return hasWebAddress(text) || hasSpelledDot(text) || hasIllegalDot(view);
}

function decide(input: string): DisplayNameResult {
  const cleaned = prepare(input);
  if (!cleaned || !/\p{L}|\p{N}/u.test(cleaned)) return { ok: false, error: "Name is required." };
  if (violates(cleaned)) return { ok: false, error: DISPLAY_NAME_ERROR };
  const capped = codePoints(cleaned).slice(0, DISPLAY_NAME_MAX).join("").trim();
  if (!capped || !/\p{L}|\p{N}/u.test(capped)) return { ok: false, error: "Name is required." };
  if (violates(capped)) return { ok: false, error: DISPLAY_NAME_ERROR };
  return { ok: true, name: capped };
}

function isAccepted(result: DisplayNameResult): result is { ok: true; name: string } {
  return result.ok === true;
}

/** Write path. A bad name is an error. A valid name is normalised and capped. */
export function validateDisplayName(input: unknown): DisplayNameResult {
  if (typeof input !== "string") return { ok: false, error: "Name is required." };
  return decide(input);
}

/** Write path. Returns the normalised name, or throws DisplayNameError. */
export function acceptedDisplayName(input: unknown): string {
  const result = validateDisplayName(input);
  if (isAccepted(result)) return result.name;
  throw new DisplayNameError(result.error);
}

/**
 * Display path. A missing or rejected stored name becomes "Member".
 * Does not write.
 */
export function sanitizeDisplayName(input: unknown): string {
  if (typeof input !== "string") return DISPLAY_NAME_FALLBACK;
  const result = decide(input);
  return result.ok ? result.name : DISPLAY_NAME_FALLBACK;
}

/** Display-time pass. A blank stays blank so the UI can hide a missing name. */
export function sanitizeRenderedName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  return sanitizeDisplayName(value);
}

/** Null stays null. A blank string stays blank. Any other string is for display. */
export function sanitizeOptionalName(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  if (!value.trim()) return "";
  return sanitizeDisplayName(value);
}

/** Write path for a user record. Refuses the save when a name field fails the policy. */
export function normalizeNameFields<T extends object>(record: T): T {
  const source = record as Record<string, unknown>;
  const next: Record<string, unknown> = { ...source };
  for (const key of NAME_KEYS) {
    if (typeof source[key] !== "string") continue;
    next[key] = acceptedDisplayName(source[key]);
  }
  return next as T;
}

/** @deprecated Writes must use normalizeNameFields. This still throws, so a bad name is not stored. */
export function sanitizeNameFields<T extends object>(record: T): T {
  return normalizeNameFields(record);
}

/**
 * Display copy of a user record. A stored name that fails the policy is shown
 * as "Member". Blank strings stay blank. Does not write.
 */
export function presentAccountNames<T extends object>(record: T): T {
  const source = record as Record<string, unknown>;
  const next: Record<string, unknown> = { ...source };
  for (const key of NAME_KEYS) {
    if (typeof source[key] !== "string") continue;
    const raw = source[key] as string;
    next[key] = raw.trim() ? sanitizeDisplayName(raw) : raw;
  }
  return next as T;
}
