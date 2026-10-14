/**
 * Tokens with offensive or joke names are not listed on the public site (lists, sitemap, links).
 * A direct visit gets a plain "not listed" page with an h1 and noindex.
 */
const JUNK_WORDS = [
  "boner", "penis", "dick", "cock", "pussy", "fuck", "shit", "cum", "butt", "fart", "poop", "ass", "nigg", "retard",
  "sex", "porn", "nsfw", "tits", "boob", "hitler", "nazi", "scam", "rug",
];

export function isJunkCoin(...labels: (string | null | undefined)[]): boolean {
  for (const label of labels) {
    const words = String(label || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (words.some((word) => JUNK_WORDS.includes(word) || (word.length > 5 && JUNK_WORDS.some((j) => j.length >= 5 && word.includes(j))))) {
      return true;
    }
  }
  return false;
}
