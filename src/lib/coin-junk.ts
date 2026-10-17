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

/**
 * Goal b12 G-17: universe hygiene for the /markets crypto list. Tokenised
 * stocks and bridged, wrapped or liquid-staked duplicates of a listed coin are
 * left out, so every linked coin page is a primary asset with its own figures.
 */
export function isDuplicateOrTokenisedCoin(id: string | null | undefined): boolean {
  const slug = String(id || "").toLowerCase();
  if (!slug) return false;
  if (/-tokenized-stock$/.test(slug)) return true;
  if (/(^|-)bridged(-|$)/.test(slug)) return true;
  if (/(^|-)wrapped(-|$)/.test(slug)) return true;
  if (/(^|-)staked(-|$)/.test(slug)) return true;
  return ["weth", "wbtc", "steth", "wsteth", "cbbtc", "cbeth", "reth"].includes(slug);
}

/** A listed coin page needs cap, 24h volume, circulating supply and 1h change from the source. */
export function coinDepthComplete(coin: {
  marketCap?: number | null;
  volume24h?: number | null;
  circulatingSupply?: number | null;
  change1h?: number | null;
}): boolean {
  const pos = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) && v > 0;
  return pos(coin.marketCap) && pos(coin.volume24h) && pos(coin.circulatingSupply) && typeof coin.change1h === "number";
}
