/**
 * H-6: report prose as members read it. Markdown markup is removed (the
 * report view and the emails print plain text), paid-feature upsells are
 * removed from Stox/Koins prose, and trading imperatives become neutral words.
 */

const MARKDOWN_RULES: Array<[RegExp, string]> = [
  [/\*\*([^*\n]+)\*\*/g, "$1"],
  [/__([^_\n]+)__/g, "$1"],
  [/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1$2"],
  [/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, "$1$2"],
  [/`([^`\n]+)`/g, "$1"],
  [/^\s{0,3}#{1,6}\s+/gm, ""],
  [/\*\*|__/g, ""],
];

export function stripMarkdown(text: string): string {
  let out = text;
  for (const [re, to] of MARKDOWN_RULES) out = out.replace(re, to);
  return out;
}

const IMPERATIVES: Array<[RegExp, string]> = [
  [/\bstrong buy\b/gi, "strongly positive indicator"],
  [/\bstrong sell\b/gi, "strongly negative indicator"],
  [/\b(buy|sell) now\b/gi, "review"],
];

export function neutralImperatives(text: string): string {
  let out = text;
  for (const [re, to] of IMPERATIVES) out = out.replace(re, to);
  return out;
}

/** Drop sentences that point a Stox/Koins reader at Headmaster. */
export function dropHeadmasterUpsell(text: string): string {
  if (!/headmaster/i.test(text)) return text;
  // A sentence ends at . ! or ? followed by a space, a newline or the end, so
  // "NZ$11,426.40" stays whole.
  const sentences = text.split(/(?<=[.!?])(?=\s)|(?=\n)/);
  return sentences
    .filter((s) => !/headmaster/i.test(s))
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function cleanReportProse(text: string, opts: { allowHeadmaster?: boolean } = {}): string {
  const plain = neutralImperatives(stripMarkdown(text));
  return opts.allowHeadmaster ? plain : dropHeadmasterUpsell(plain);
}

/** Keys whose values are identifiers or links, never prose. */
const NON_PROSE_KEYS = new Set(["_id", "id", "url", "href", "pdfUrl", "ticker", "symbol", "coinId", "bot", "trigger", "currency", "generatedAt", "createdAt", "asOf", "quotedAt"]);

/**
 * b6 H-6: stored reports from before the H-6 fix still hold raw markdown and
 * the "Headmaster skeleton" line. Clean every prose string at view time so old
 * reports read the same as new ones. Nothing is written back.
 */
export function cleanStoredReport<T>(value: T, opts: { allowHeadmaster?: boolean } = {}, depth = 0): T {
  if (depth > 8) return value;
  if (typeof value === "string") return cleanReportProse(value, opts) as T;
  if (Array.isArray(value)) return value.map((item) => cleanStoredReport(item, opts, depth + 1)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = NON_PROSE_KEYS.has(key) ? inner : cleanStoredReport(inner, opts, depth + 1);
    }
    return out as T;
  }
  return value;
}
