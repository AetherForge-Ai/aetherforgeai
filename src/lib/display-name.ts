/**
 * SEC-NAME-1: one sanitiser for account display names.
 * Used on every server write that stores a name, and again wherever a name is rendered,
 * so a name already saved cannot be shown as a phishing lure.
 * Pure (no I/O) so client code can call it as an extra check. The server write is the protection.
 */

export const DISPLAY_NAME_MAX = 40;
export const DISPLAY_NAME_FALLBACK = "Member";

/** Common TLDs, including the ones used to hide a host in a display name. Longer first. */
const SIMPLE_TLDS = [
  "online", "store", "cloud", "email", "click", "download", "website", "digital", "agency",
  "info", "shop", "blog", "tech", "site", "live", "link", "name", "mobi", "asia", "club",
  "app", "dev", "xyz", "top", "vip", "pro", "biz", "edu", "gov", "mil", "int", "com", "net",
  "org", "io", "ai", "co", "me", "tv", "cc", "pw", "ru", "cn", "de", "uk", "us", "nz", "au",
  "ca", "eu", "fr", "jp", "kr", "in", "br", "za", "sg", "hk", "ie", "se", "no", "fi", "ch",
  "at", "be", "pt", "mx", "id", "ph", "th", "my", "ae", "tr", "ua", "pl", "nl", "es", "it",
  "dk", "cz", "gr", "ro", "hu", "il", "sa", "ng", "ke", "to", "ws", "ly", "gl", "fm", "am",
  "sh", "ac", "nu", "gg", "tw", "vn", "pk", "bd", "qa", "kw",
].sort((a, b) => b.length - a.length);

const TLD_SET = new Set(SIMPLE_TLDS);
const TLD = `(?:xn--[a-z0-9-]{2,}|${SIMPLE_TLDS.join("|")})`;

const LURE =
  /\b(?:(?:the\s+)?site\s+has\s+moved|has\s+moved\s+to|moved\s+to|(?:please\s+)?(?:visit|log\s*-?\s*in|login|sign\s*-?\s*in)\s+(?:us\s+)?(?:at|here|there))\b/gi;

const SCHEME = /\b(?:(?:[a-z][a-z0-9+.-]{0,20}|hxxps?):\/\/|www\.)\S+/gi;
const SCRIPT_SCHEME = /\b(?:javascript|data|vbscript)\s*:\S*/gi;
const AT_EMAIL = new RegExp(
  String.raw`\b[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[a-z0-9.-]+\.${TLD}\b`,
  "gi",
);
const AT_WORD = new RegExp(
  String.raw`\b[a-z0-9._%+-]+\s+at\s+[a-z0-9-]+(?:\.[a-z0-9-]+)*\.${TLD}\b`,
  "gi",
);
const DOMAIN = new RegExp(
  String.raw`\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+${TLD}\b`,
  "gi",
);
const PUNYCODE = /\bxn--[a-z0-9-]{2,}\b/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const DOT_BEFORE_TLD = new RegExp(String.raw`([A-Za-z0-9])\s*\.\s*(?=${TLD}\b)`, "gi");
const SPELLED_DOT = /\b[a-z0-9-]+(?:\s+dot\s+[a-z0-9-]+)+\b/gi;

const NAME_KEYS = ["name", "first_name", "last_name", "firstName", "lastName"] as const;

function reset(re: RegExp) {
  re.lastIndex = 0;
}

function deobfuscate(value: string): string {
  return value
    .replace(/\[\s*(?:\.|dot)\s*\]/gi, ".")
    .replace(/\(\s*(?:\.|dot)\s*\)/gi, ".")
    .replace(/\{\s*(?:\.|dot)\s*\}/gi, ".")
    .replace(/([A-Za-z0-9])[。｡](?=[A-Za-z0-9])/g, "$1.")
    .replace(/hxxp(s?):\/\//gi, "http$1://")
    .replace(/\[\s*:\s*\]/g, ":");
}

function stripSpelledDots(value: string): string {
  return value.replace(SPELLED_DOT, (match) => {
    const parts = match.split(/\s+dot\s+/i).map((part) => part.toLowerCase());
    const last = parts[parts.length - 1] || "";
    if (TLD_SET.has(last) || last.startsWith("xn--")) return " ";
    return match;
  });
}

function stripUrls(value: string): string {
  let s = value.replace(DOT_BEFORE_TLD, "$1.");
  reset(DOT_BEFORE_TLD);
  s = stripSpelledDots(s);
  for (const re of [SCHEME, SCRIPT_SCHEME, AT_EMAIL, AT_WORD, DOMAIN, PUNYCODE, IPV4]) {
    s = s.replace(re, " ");
    reset(re);
  }
  return s;
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

/**
 * NFKC, strip controls / zero-width / bidi overrides, remove URL-like text and
 * lure phrases, collapse whitespace, cap at 40 characters.
 * Empty results become "Member". Safe to call twice.
 */
export function sanitizeDisplayName(input: unknown): string {
  if (typeof input !== "string") return DISPLAY_NAME_FALLBACK;
  const bounded = input.length > 500 ? input.slice(0, 500) : input;
  let s = bounded.normalize("NFKC");
  s = s.replace(/\p{Cc}|\p{Cf}|[\u2028\u2029]/gu, "");
  s = deobfuscate(s);
  s = s.replace(LURE, " ");
  reset(LURE);
  s = stripUrls(s);
  s = tidy(s);
  if (!/\p{L}|\p{N}/u.test(s)) return DISPLAY_NAME_FALLBACK;
  const chars = Array.from(s);
  if (chars.length > DISPLAY_NAME_MAX) {
    s = tidy(chars.slice(0, DISPLAY_NAME_MAX).join(""));
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
