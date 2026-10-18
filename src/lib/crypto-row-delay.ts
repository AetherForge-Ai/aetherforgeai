/** b38 H-1: pure helpers (no server imports) shared by the snapshot store, /markets and tests. */
import type { CoinMarket } from "@/lib/crypto-market";

/** b38 H-1: after this age a partial list refreshes the coins it matches (Chief ruling: 10 min). */
export const CRYPTO_PARTIAL_REFRESH_AFTER_MS = 10 * 60 * 1000;
/** b38 H-1: a row whose own quote is older than this shows a visible "delayed" marker. */
export const CRYPTO_ROW_DELAYED_AFTER_MS = 15 * 60 * 1000;

/**
 * b38 H-1: refresh matching coins from a partial list; the rest keep their price AND their own
 * last-updated time (the list's previous time when a row had none). Null when nothing matched.
 */
export function mergeStaleCryptoList(
  existing: { at: string; coins: CoinMarket[] },
  incoming: CoinMarket[],
  at: string
): CoinMarket[] | null {
  // b41 H-1: per-row checks — a valid price, a readable (not future) quote time, and a coin the saved
  // list already knows (by id, else symbol). Rows that fail are skipped; the rest still refresh.
  const atMs = Date.parse(at);
  const rowOk = (c: CoinMarket) => {
    if (!(typeof c.price === "number" && Number.isFinite(c.price) && c.price > 0)) return false;
    if (c.quotedAt) {
      const t = Date.parse(c.quotedAt);
      if (!Number.isFinite(t) || (Number.isFinite(atMs) && t - atMs > 2 * 60 * 1000)) return false;
    }
    return true;
  };
  const ok = incoming.filter(rowOk);
  const byId = new Map(ok.filter((c) => c.id).map((c) => [String(c.id).toLowerCase(), c]));
  const bySymbol = new Map(ok.map((c) => [c.symbol.toUpperCase(), c]));
  let matched = 0;
  const coins = existing.coins.map((coin) => {
    const fresh = (coin.id ? byId.get(String(coin.id).toLowerCase()) : undefined) ?? bySymbol.get(coin.symbol.toUpperCase());
    // Never replace a row with an older quote than it already has.
    if (fresh?.quotedAt && coin.quotedAt && Date.parse(fresh.quotedAt) < Date.parse(coin.quotedAt)) return coin;
    if (!fresh) return { ...coin, quotedAt: coin.quotedAt || existing.at || null };
    matched += 1;
    return {
      ...coin,
      price: fresh.price,
      change24h: Number.isFinite(fresh.change24h) ? fresh.change24h : coin.change24h,
      quotedAt: fresh.quotedAt || at,
      source: fresh.source || coin.source,
    };
  });
  return matched ? coins : null;
}

/** b41 H-1: how many incoming rows pass the per-row checks against the saved list (for /status). */
export function countMergeableRows(existing: { coins: CoinMarket[] }, incoming: CoinMarket[]): number {
  const ids = new Set(existing.coins.map((c) => String(c.id || "").toLowerCase()).filter(Boolean));
  const syms = new Set(existing.coins.map((c) => c.symbol.toUpperCase()));
  return incoming.filter((c) => Number.isFinite(c.price) && c.price > 0 && (ids.has(String(c.id || "").toLowerCase()) || syms.has(c.symbol.toUpperCase()))).length;
}

/** b38 H-1: true when this row's own quote time is older than 15 minutes (or unknown). */
export function cryptoRowDelayed(quotedAt: string | null | undefined, now = Date.now()): boolean {
  const t = Date.parse(quotedAt || "");
  return !Number.isFinite(t) || now - t > CRYPTO_ROW_DELAYED_AFTER_MS;
}

