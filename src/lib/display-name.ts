/**
 * SEC-NAME-1: one sanitiser for account display names.
 * Used on every server write that stores a name, and again wherever a name is rendered,
 * so a name already saved cannot be shown as a phishing lure.
 * Pure (no I/O) so client code can call it as an extra check. The server write is the protection.
 *
 * A tight lowercase label.label is a host with no TLD list. Spaced dots, the word
 * "dot", and middle dots count only when the word after them is TLD-shaped.
 * Single-letter initials and titles (Dr, Mr, Mrs, Ms, St, Jr, Sr, Prof) are not hosts.
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

/**
 * Dot-like characters folded to "." before matching.
 * U+00B7 MIDDLE DOT and U+30FB KATAKANA MIDDLE DOT are not in this set:
 * they are name separators (约翰·史密斯, Marcel·la) unless both sides are a Latin label and a TLD.
 */
const ALWAYS_DOT = new Set([
  ".",
  "\u2219", // ∙ bullet operator
  "\u22c5", // ⋅ dot operator
  "\ua4f8", // ꓸ lisu tone mya ti
  "\u0660", // ٠ arabic-indic zero
  "\u06f0", // ۰ extended arabic-indic zero
  "\u2024", // one dot leader
  "\uff0e", // ． fullwidth full stop
  "\u3002", // 。 ideographic full stop
  "\uff61", // ｡ halfwidth ideographic full stop
  "\ufe52", // small full stop
  "\u2027", // hyphenation point
  "\u02d9", // ˙ dot above
  "\u0387", // greek ano teleia
]);

/** Name-internal middle dots. Folded only for a Latin label plus a TLD-shaped word. */
const MIDDLE_DOT = new Set(["\u00b7", "\u30fb", "\uff65"]);

/**
 * Used for spaced dots, the word "dot", and middle dots.
 * Tight lowercase label.label still matches with no list, so an unknown TLD cannot hide.
 * Two-letter name particles such as "la" are omitted on purpose.
 */
const TLD = new Set([
  "com", "net", "org", "edu", "gov", "mil", "int", "info", "biz", "name", "pro", "mobi", "asia",
  "app", "dev", "io", "ai", "co", "me", "tv", "cc", "xyz", "online", "site", "tech", "store",
  "shop", "blog", "cloud", "email", "live", "link", "click", "top", "vip", "help", "zip", "mov",
  "page", "support", "club", "pw", "nz", "uk", "au", "us", "ca", "eu", "de", "fr", "jp", "kr",
  "in", "br", "ru", "cn", "sg", "hk", "ie", "se", "no", "fi", "ch", "at", "be", "pt", "mx", "id",
  "ph", "th", "my", "ae", "tr", "ua", "pl", "nl", "es", "it", "dk", "cz", "ws", "ly", "to",
  "рф",
]);

const TITLES = new Set(["dr", "mr", "mrs", "ms", "st", "jr", "sr", "prof"]);

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
  if (cp >= 0xfff9 && cp <= 0xfffb) return true;
  if (cp >= 0x0600 && cp <= 0x0605) return true;
  if (cp === 0x2028 || cp === 0x2029) return true;
  return /\p{Default_Ignorable_Code_Point}|\p{Variation_Selector}|\p{Cc}/u.test(ch);
}

function caseFold(ch: string): string {
  const lower = ch.toLowerCase();
  return Array.from(lower).length === 1 ? lower : ch;
}

function viewChar(ch: string): string {
  if (!ch) return "";
  if (ALWAYS_DOT.has(ch)) return ".";
  const folded = caseFold(ch);
  if (ALWAYS_DOT.has(folded)) return ".";
  return CONFUSABLES[folded] ?? CONFUSABLES[ch] ?? folded;
}

function isMark(ch: string): boolean {
  return /\p{M}/u.test(ch);
}

function isTld(folded: string): boolean {
  return TLD.has(folded) || folded.startsWith("xn--");
}

function isLatinLabel(folded: string): boolean {
  return /^[a-z0-9-]+$/.test(folded);
}

function isLabelChar(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch) || ch === "-" ;
}

function isLabelEdge(ch: string): boolean {
  return /[\p{L}\p{N}]/u.test(ch);
}

type Label = { start: number; end: number; folded: string; original: string };
type Sep = { end: number; kind: "tight" | "spaced" | "spelled" | "middle" | "obfuscated" };

function readLabel(chars: string[], i: number): Label | null {
  if (i >= chars.length || isMark(chars[i])) return null;
  if (!isLabelEdge(viewChar(chars[i]))) return null;
  let j = i;
  let folded = "";
  while (j < chars.length) {
    if (isMark(chars[j])) {
      j++;
      continue;
    }
    if (ALWAYS_DOT.has(chars[j]) || MIDDLE_DOT.has(chars[j])) break;
    const v = viewChar(chars[j]);
    if (!isLabelChar(v) || v === ".") break;
    folded += v;
    j++;
  }
  if (!folded || !isLabelEdge(folded[folded.length - 1])) return null;
  return { start: i, end: j, folded, original: chars.slice(i, j).join("") };
}

function readBracketDot(chars: string[], i: number): number {
  let j = i;
  while (j < chars.length && chars[j] === " ") j++;
  const open = chars[j];
  const close = open === "(" ? ")" : open === "[" ? "]" : open === "{" ? "}" : "";
  if (!close) return -1;
  j++;
  while (j < chars.length && chars[j] === " ") j++;
  if (j < chars.length && (ALWAYS_DOT.has(chars[j]) || chars[j] === ".")) j++;
  else if (
    j + 2 < chars.length &&
    viewChar(chars[j]) === "d" &&
    viewChar(chars[j + 1]) === "o" &&
    viewChar(chars[j + 2]) === "t"
  ) {
    j += 3;
  } else return -1;
  while (j < chars.length && chars[j] === " ") j++;
  if (chars[j] !== close) return -1;
  j++;
  while (j < chars.length && chars[j] === " ") j++;
  return j;
}

function readSpelledDot(chars: string[], i: number): number {
  if (chars[i] !== " ") return -1;
  let j = i;
  while (j < chars.length && chars[j] === " ") j++;
  if (viewChar(chars[j]) !== "d" || viewChar(chars[j + 1]) !== "o" || viewChar(chars[j + 2]) !== "t") return -1;
  const after = chars[j + 3] ?? "";
  if (after && isLabelChar(viewChar(after)) && viewChar(after) !== ".") return -1;
  j += 3;
  if (chars[j] !== " ") return -1;
  while (j < chars.length && chars[j] === " ") j++;
  return j;
}

function readSeparator(chars: string[], i: number): Sep | null {
  const bracket = readBracketDot(chars, i);
  if (bracket > i) return { end: bracket, kind: "obfuscated" };
  const spelled = readSpelledDot(chars, i);
  if (spelled > i) return { end: spelled, kind: "spelled" };
  if (MIDDLE_DOT.has(chars[i])) return { end: i + 1, kind: "middle" };
  let j = i;
  let spaced = false;
  while (j < chars.length && chars[j] === " ") {
    spaced = true;
    j++;
  }
  if (j < chars.length && ALWAYS_DOT.has(chars[j])) {
    j++;
    while (j < chars.length && chars[j] === " ") {
      spaced = true;
      j++;
    }
    return { end: j, kind: spaced ? "spaced" : "tight" };
  }
  return null;
}

function isInitials(labels: Label[]): boolean {
  return labels.every((label) => label.folded.length === 1);
}

function isIpv4(labels: Label[]): boolean {
  return labels.length === 4 && labels.every((label) => /^\d{1,3}$/.test(label.folded));
}

function isGenericHost(labels: Label[]): boolean {
  return labels.every((label) => label.folded.length >= 2 && !/\p{Lu}/u.test(label.original));
}

/** True when these labels are a host, not initials, a title, or a name like Ng.Wei. */
function hostCounts(labels: Label[]): boolean {
  if (labels.length < 2) return false;
  if (isIpv4(labels)) return true;
  if (isInitials(labels)) return false;
  const last = labels[labels.length - 1].folded;
  if (labels.length === 2 && TITLES.has(labels[0].folded) && !isTld(last)) return false;
  if (isTld(last)) return true;
  return isGenericHost(labels);
}

function separatorKeeps(kind: Sep["kind"], prev: Label, next: Label): boolean {
  if (kind === "tight" || kind === "obfuscated") return true;
  if (kind === "middle") return isLatinLabel(prev.folded) && isLatinLabel(next.folded) && isTld(next.folded);
  return isTld(next.folded);
}

function readHost(chars: string[], start: number): number {
  if (start > 0 && !isMark(chars[start - 1]) && isLabelChar(viewChar(chars[start - 1])) && viewChar(chars[start - 1]) !== ".") {
    return -1;
  }
  const first = readLabel(chars, start);
  if (!first) return -1;
  const labels = [first];
  let pos = first.end;
  while (pos < chars.length) {
    const sep = readSeparator(chars, pos);
    if (!sep || sep.end <= pos) break;
    const next = readLabel(chars, sep.end);
    if (!next) break;
    if (!separatorKeeps(sep.kind, labels[labels.length - 1], next)) break;
    labels.push(next);
    pos = next.end;
  }
  if (!hostCounts(labels)) return -1;
  return labels[labels.length - 1].end;
}

function findDomains(chars: string[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let i = 0; i < chars.length; i++) {
    const end = readHost(chars, i);
    if (end > i) {
      spans.push([i, end]);
      i = end - 1;
    }
  }
  return spans;
}

function readAtToken(chars: string[], i: number): { start: number; end: number } | null {
  if (chars[i] === "@") return { start: i, end: i + 1 };
  const open = chars[i];
  if (open === "(" || open === "[") {
    const close = open === "(" ? ")" : "]";
    let j = i + 1;
    while (chars[j] === " ") j++;
    if (viewChar(chars[j]) === "a" && viewChar(chars[j + 1]) === "t") {
      let k = j + 2;
      while (chars[k] === " ") k++;
      if (chars[k] === close) return { start: i, end: k + 1 };
    }
    return null;
  }
  if (viewChar(chars[i]) !== "a" || viewChar(chars[i + 1]) !== "t") return null;
  const before = i === 0 ? "" : chars[i - 1];
  if (before && before !== " ") return null;
  if (chars[i + 2] !== " ") return null;
  return { start: i, end: i + 2 };
}

function readLocalStart(chars: string[], atStart: number): number {
  let j = atStart - 1;
  while (j >= 0 && chars[j] === " ") j--;
  const localEnd = j;
  while (j >= 0 && /[\p{L}\p{N}._%+\-]/u.test(viewChar(chars[j]))) j--;
  if (localEnd < j + 1) return -1;
  return j + 1;
}

function findEmails(chars: string[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let i = 0; i < chars.length; i++) {
    const at = readAtToken(chars, i);
    if (!at) continue;
    const localStart = readLocalStart(chars, at.start);
    if (localStart < 0) continue;
    let hostAt = at.end;
    while (hostAt < chars.length && chars[hostAt] === " ") hostAt++;
    const hostEnd = readHost(chars, hostAt);
    if (hostEnd < 0) continue;
    spans.push([localStart, hostEnd]);
    i = hostEnd - 1;
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
  const needles = ["javascript:", "vbscript:", "data:", "https://", "http://", "hxxps://", "hxxp://", "www."];
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
    ...findEmails(chars),
    ...findDomains(chars),
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
    const next = tidy(removeLures(capped));
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
