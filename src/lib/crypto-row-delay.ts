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
  const bySymbol = new Map(incoming.filter((c) => c.price > 0).map((c) => [c.symbol.toUpperCase(), c]));
  let matched = 0;
  const coins = existing.coins.map((coin) => {
    const fresh = bySymbol.get(coin.symbol.toUpperCase());
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

/** b38 H-1: true when this row's own quote time is older than 15 minutes (or unknown). */
export function cryptoRowDelayed(quotedAt: string | null | undefined, now = Date.now()): boolean {
  const t = Date.parse(quotedAt || "");
  return !Number.isFinite(t) || now - t > CRYPTO_ROW_DELAYED_AFTER_MS;
}

