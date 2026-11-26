/**
 * SEC-NAME-1: one sanitiser for account display names.
 * Used on every server write that stores a name, and again wherever a name is rendered,
 * so a name already saved cannot be shown as a phishing lure.
 * Pure (no I/O) so client code can call it as an extra check. The server write is the protection.
 *
 * A domain or email is any label.label or local@host token. There is no TLD list.
 * The 40-character cap runs first, then lure removal, and that repeats until the
 * string stops changing, so a cut cannot reveal a new host.
 */

export const DISPLAY_NAME_MAX = 40;
export const DISPLAY_NAME_FALLBACK = "Member";

const NAME_KEYS = ["name", "first_name", "last_name", "firstName", "lastName"] as const;

/** ZWNJ and ZWJ stay. Persian and Devanagari use them; they are not lures. */
const KEEP_FORMAT = new Set([0x200c, 0x200d]);

/**
 * One-to-one confusable fold (UTS #39 skeletons that stay a single character).
 * Applied only to the string we match against. The stored name keeps its own letters.
 */
const CONFUSABLES: Record<string, string> = {
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y", "\u0445": "x",
  "\u0456": "i", "\u0455": "s", "\u0458": "j", "\u04bb": "h", "\u0501": "d", "\u051b": "q", "\u051d": "w",
  "\u0454": "e", "\u04cf": "l", "\u0473": "f", "\u0432": "b",
  "\u03b1": "a", "\u03b5": "e", "\u03bf": "o", "\u03c1": "p", "\u03b9": "i", "\u03ba": "k", "\u03bd": "n",
  "\u03c4": "t", "\u03c5": "u", "\u03b7": "n",
};

/** Characters that read as a dot. ASCII "." is already a dot. */
const DOT_LIKE = new Set(["\u3002", "\uff0e", "\uff61", "\u2024", "\ufe52", "\u2027", "\u00b7"]);

const PHRASES = [
  "site has moved",
  "has moved to",
  "moved to",
  "moved:",
  "please log in at",
  "please login at",
  "please sign in at",
  "log in there",
  "log in here",
  "log in at",
  "login there",
  "login here",
  "login at",
  "sign in there",
  "sign in here",
  "sign in at",
  "sign-in at",
  "visit us at",
  "visit there",
  "visit here",
  "visit at",
];

function codePoints(value: string): string[] {
  return Array.from(value);
}

function isKeptFormat(cp: number): boolean {
  return KEEP_FORMAT.has(cp);
}

/** U+034F, variation selectors, Hangul fillers, other default-ignorables, and controls. */
function isStrippedFormat(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  if (isKeptFormat(cp)) return false;
  if (cp === 0x034f || cp === 0x115f || cp === 0x1160 || cp === 0x3164 || cp === 0xffa0) return true;
  if (cp === 0x2028 || cp === 0x2029) return true;
  return /\p{Default_Ignorable_Code_Point}|\p{Variation_Selector}|\p{Cc}/u.test(ch);
}

function caseFold(ch: string): string {
  const lower = ch.toLowerCase();
  return Array.from(lower).length === 1 ? lower : ch;
}

function viewChar(ch: string): string {
  if (ch === "." || DOT_LIKE.has(ch)) return ".";
  const folded = caseFold(ch);
  if (DOT_LIKE.has(folded)) return ".";
  return CONFUSABLES[folded] ?? CONFUSABLES[ch] ?? folded;
}

function isLabelChar(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch) || ch === "-" ;
}

function isLabelEdge(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch);
}

/** label(.label)+ with the dot tight against both labels. "K. Ng" does not match. */
function matchDomainAt(view: string[], start: number): number {
  const n = view.length;
  if (start >= n || !isLabelEdge(view[start])) return -1;
  if (start > 0 && isLabelChar(view[start - 1])) return -1;
  let i = start;
  let labels = 0;
  while (i < n) {
    if (!isLabelEdge(view[i])) return -1;
    let j = i + 1;
    while (j < n && isLabelChar(view[j])) j++;
    if (!isLabelEdge(view[j - 1])) return -1;
    labels += 1;
    if (j < n && view[j] === "." && j + 1 < n && isLabelEdge(view[j + 1])) {
      i = j + 1;
      continue;
    }
    return labels >= 2 ? j : -1;
  }
  return -1;
}

function findDomains(view: string[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let i = 0; i < view.length; i++) {
    const end = matchDomainAt(view, i);
    if (end > i) {
      spans.push([i, end]);
      i = end - 1;
    }
  }
  return spans;
}

function findEmails(view: string[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let i = 0; i < view.length; i++) {
    if (view[i] !== "@") continue;
    let left = i - 1;
    while (left >= 0 && view[left] === " ") left--;
    const localEnd = left;
    while (left >= 0 && /[\p{L}\p{N}._%+\-]/u.test(view[left])) left--;
    const localStart = left + 1;
    if (localStart > localEnd) continue;
    let right = i + 1;
    while (right < view.length && view[right] === " ") right++;
    const domainEnd = matchDomainAt(view, right);
    if (domainEnd < 0) continue;
    spans.push([localStart, domainEnd]);
    i = domainEnd - 1;
  }
  return spans;
}

function findSequence(view: string[], needle: string, from: number): number {
  const parts = Array.from(needle);
  for (let i = from; i + parts.length <= view.length; i++) {
    let same = true;
    for (let j = 0; j < parts.length; j++) {
      if (view[i + j] !== parts[j]) {
        same = false;
        break;
      }
    }
    if (same) return i;
  }
  return -1;
}

function findSchemes(view: string[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const needles = ["javascript:", "vbscript:", "data:", "https://", "http://", "www."];
  for (const needle of needles) {
    let from = 0;
    while (from < view.length) {
      const at = findSequence(view, needle, from);
      if (at < 0) break;
      let end = at + Array.from(needle).length;
      while (end < view.length && view[end] !== " " && view[end] !== "\t") end++;
      spans.push([at, end]);
      from = end;
    }
  }
  return spans;
}

function findPhrases(view: string[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const phrase of PHRASES) {
    const size = Array.from(phrase).length;
    let from = 0;
    while (from < view.length) {
      const at = findSequence(view, phrase, from);
      if (at < 0) break;
      const before = at === 0 ? "" : view[at - 1];
      const after = view[at + size] ?? "";
      const boundaryBefore = !before || !/[\p{L}\p{N}]/u.test(before);
      const boundaryAfter = !after || !/[\p{L}\p{N}]/u.test(after);
      if (boundaryBefore && boundaryAfter) spans.push([at, at + size]);
      from = at + size;
    }
  }
  return spans;
}

function findPunycode(view: string[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let from = 0;
  while (from < view.length) {
    const at = findSequence(view, "xn--", from);
    if (at < 0) break;
    let end = at + 4;
    while (end < view.length && /[\p{L}\p{N}-]/u.test(view[end])) end++;
    spans.push([at, end]);
    from = end;
  }
  return spans;
}

function blank(chars: string[], spans: Array<[number, number]>): string {
  if (spans.length === 0) return chars.join("");
  const drop = new Array(chars.length).fill(false);
  for (const [start, end] of spans) {
    for (let i = Math.max(0, start); i < end && i < chars.length; i++) drop[i] = true;
  }
  return chars.filter((_, i) => !drop[i]).join("");
}

function deobfuscate(value: string): string {
  return value
    .replace(/\s*\[\s*(?:\.|dot)\s*\]\s*/gi, ".")
    .replace(/\s*\(\s*(?:\.|dot)\s*\)\s*/gi, ".")
    .replace(/\s*\{\s*(?:\.|dot)\s*\}\s*/gi, ".")
    .replace(/\(\s*at\s*\)/gi, "@")
    .replace(/\[\s*at\s*\]/gi, "@")
    .replace(/\[\s*:\s*\]/g, ":")
    .replace(/hxxp(s?):\/\//gi, "http$1://");
}

/** "evil dot com" is a host. "Mary dot Ngata" keeps the capitalised name word. */
function stripSpelledDots(value: string): string {
  return value.replace(/\b[\p{L}\p{N}-]+(?:\s+dot\s+[\p{L}\p{N}-]+)+\b/giu, (match) => {
    const parts = match.split(/\s+dot\s+/i);
    const last = parts[parts.length - 1] ?? "";
    const mixedCase = /\p{Ll}/u.test(last) && /\p{Lu}/u.test(last);
    return mixedCase ? match : " ";
  });
}

function rewriteProse(value: string): string {
  const dotted = stripSpelledDots(deobfuscate(value));
  return dotted.replace(
    /([\p{L}\p{N}._%+\-]+)\s+at\s+(?=[\p{L}\p{N}][\p{L}\p{N}-]*\.)/giu,
    "$1@",
  );
}

function tidy(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,;:!?])/g, "$1")
    .replace(/^[\s,;:!?()[\]{}'"]+|[\s,;:!?()[\]{}'"]+$/g, "")
    .trim();
}

function removeLures(value: string): string {
  const chars = codePoints(value);
  const view = chars.map(viewChar);
  const spans = [
    ...findSchemes(view),
    ...findEmails(view),
    ...findDomains(view),
    ...findPunycode(view),
    ...findPhrases(view),
  ];
  return blank(chars, spans);
}

function prepare(value: string): string {
  const stripped = codePoints(value).filter((ch) => !isStrippedFormat(ch)).join("");
  const normalised = stripped.normalize("NFKC");
  return codePoints(normalised).filter((ch) => !isStrippedFormat(ch)).join("");
}

/**
 * Strip invisibles, NFKC, confusable-fold for matching, then cut to 40 and
 * remove lures until a fixpoint. Empty results become "Member".
 */
export function sanitizeDisplayName(input: unknown): string {
  if (typeof input !== "string") return DISPLAY_NAME_FALLBACK;
  const bounded = codePoints(input).slice(0, 500).join("");
  let s = prepare(bounded);
  for (let pass = 0; pass < 8; pass++) {
    const chars = codePoints(s);
    const capped = chars.length > DISPLAY_NAME_MAX ? chars.slice(0, DISPLAY_NAME_MAX).join("") : s;
    const next = tidy(removeLures(rewriteProse(capped)));
    if (next === s) break;
    s = next;
  }
  if (!s || !/\p{L}|\p{N}/u.test(s)) return DISPLAY_NAME_FALLBACK;
  return s;
}

/** Display-time pass. A missing name stays blank; a lure becomes a safe label. */
export function sanitizeRenderedName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  return sanitizeDisplayName(value);
}

/** Null stays null. A blank string stays blank. Any other string is sanitised. */
export function sanitizeOptionalName(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  if (!value.trim()) return "";
  return sanitizeDisplayName(value);
}

/** Sanitise name fields that are actually present. A blank string becomes "Member". Does not invent a name key. */
export function sanitizeNameFields<T extends object>(record: T): T {
  const source = record as Record<string, unknown>;
  const next: Record<string, unknown> = { ...source };
  for (const key of NAME_KEYS) {
    if (typeof source[key] === "string") next[key] = sanitizeDisplayName(source[key]);
  }
  return next as T;
}

/**
 * Display copy of a user record. Blank strings stay blank so a missing name is not
 * rewritten to "Member" in the response. Does not write anything.
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
