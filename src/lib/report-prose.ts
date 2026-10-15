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
