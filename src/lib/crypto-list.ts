/**
 * Merge priced crypto rows from more than one feed.
 * Dedupe by symbol and by contract. Cap at 400. Never invent a row.
 *
 * pull-check:crypto-dex-400-2026-10-11
 */

import { MARKET_LIST_TARGET } from "@/lib/crypto-coverage";
import { coinHasLivePrice, type CoinMarket } from "@/lib/crypto-market";
import { CRYPTO_SANITY_RATIO } from "@/lib/crypto-tape";

/** True when two positive prices stay within CRYPTO_SANITY_RATIO of each other. */
export function rankedPricesAgree(a: number, b: number, ratio = CRYPTO_SANITY_RATIO): boolean {
  if (!(a > 0) || !(b > 0) || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  const span = a > b ? a / b : b / a;
  return span <= ratio;
}

function contractList(coin: CoinMarket): string[] {
  const out: string[] = [];
  for (const value of coin.contracts || []) {
    const key = String(value || "").trim().toLowerCase();
    if (key.length >= 8 && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Prefer a CoinGecko slug over a bare ticker so the detail route can load. */
function betterId(a: string, b: string): string {
  const score = (id: string) => {
    const raw = (id || "").trim().toLowerCase();
    if (!raw) return 0;
    if (raw.includes("-") || raw.length > 6) return 2;
    return 1;
  };
  return score(a) >= score(b) ? a : b;
}

function capOf(coin: CoinMarket): number {
  return coin.marketCap > 0 ? coin.marketCap : 0;
}

/**
 * Keep one print. When the two prices disagree by more than the sanity ratio,
 * the higher market cap wins and the other price is not copied in.
 */
export function preferRankedCoin(prev: CoinMarket, next: CoinMarket): CoinMarket {
  const agree = rankedPricesAgree(prev.price, next.price);
  let primary = prev;
  let secondary = next;
  const nextRicher = capOf(next) > capOf(prev) || (capOf(next) === capOf(prev) && (next.rank ?? 999999) < (prev.rank ?? 999999));
  if (agree ? nextRicher : capOf(next) > capOf(prev)) {
    primary = next;
    secondary = prev;
  }
  const contracts = [...new Set([...contractList(primary), ...contractList(secondary)])];
  const name =
    primary.name && primary.name.toUpperCase() !== primary.symbol.toUpperCase()
      ? primary.name
      : secondary.name || primary.name;
  return {
    ...primary,
    id: betterId(primary.id, secondary.id),
    name,
    image: primary.image || secondary.image,
    blockchain:
      primary.blockchain && primary.blockchain !== "Unavailable" ? primary.blockchain : secondary.blockchain,
    contracts,
    marketCap: agree ? Math.max(capOf(prev), capOf(next)) : capOf(primary),
    volume24h: agree ? Math.max(prev.volume24h || 0, next.volume24h || 0) : primary.volume24h,
    rank: agree ? Math.min(prev.rank ?? 999999, next.rank ?? 999999) : primary.rank,
    price: primary.price,
  };
}

/**
 * One row per symbol, and one row when two symbols share a contract.
 * Earlier lists are the base. Later lists fill symbols that are not already present,
 * or replace a row when they win preferRankedCoin. The result is capped at 400.
 */
export function mergeRankedCoins(lists: CoinMarket[][], limit = MARKET_LIST_TARGET): CoinMarket[] {
  const rows = new Map<string, CoinMarket>();
  const owner = new Map<string, string>();

  const absorb = (coin: CoinMarket) => {
    if (!coin || !coinHasLivePrice(coin)) return;
    const symbol = (coin.symbol || "").trim().toUpperCase();
    if (!symbol) return;
    const contracts = contractList(coin);
    let target = symbol;
    for (const contract of contracts) {
      const found = owner.get(contract);
      if (found) {
        target = found;
        break;
      }
    }
    const prev = rows.get(target);
    const incoming = { ...coin, symbol, contracts };
    const chosen = prev ? preferRankedCoin(prev, incoming) : incoming;
    if (prev && prev.symbol.toUpperCase() !== chosen.symbol.toUpperCase()) {
      rows.delete(prev.symbol.toUpperCase());
    }
    rows.set(chosen.symbol.toUpperCase(), chosen);
    for (const contract of contractList(chosen)) owner.set(contract, chosen.symbol.toUpperCase());
  };

  for (const list of lists) {
    for (const coin of list || []) absorb(coin);
  }

  return [...rows.values()]
    .sort((a, b) => {
      const cap = capOf(b) - capOf(a);
      if (cap !== 0) return cap;
      return (a.rank ?? 999999) - (b.rank ?? 999999);
    })
    .slice(0, Math.max(0, limit));
}
