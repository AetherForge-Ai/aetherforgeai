/**
 * JSON bodies for the public crypto routes.
 * Status stays 200 so Cloudflare does not replace the body with "error code: 502".
 */

import { chainForTicker } from "@/lib/crypto-board";
import { dexListNotice } from "@/lib/crypto-dex";
import { coinDisplayName } from "@/lib/crypto-names";
import { LIVE_CRYPTO_UNAVAILABLE, MARKET_SIZE_FIELDS, positiveMarketStat } from "@/lib/crypto-market";

export const LIVE_DEX_UNAVAILABLE = "Live decentralized-token prices are unavailable.";

/**
 * A zero market cap, FDV, volume, high, low, supply or ATH is unknown.
 * The cell is an em dash, not 0. A real 0% change is left as 0.
 */
function feedDidNotSend(source: string, figure: string): string {
  const who = source === "coinpaprika" ? "CoinPaprika" : "The feed";
  return `${who} did not send ${figure}.`;
}

export function presentMarketCoin<T extends object>(coin: T): T {
  const next: Record<string, unknown> = { ...(coin as Record<string, unknown>) };
  for (const key of MARKET_SIZE_FIELDS) {
    if (key in next) next[key] = positiveMarketStat(next[key]);
  }
  const source = typeof next.source === "string" ? next.source.toLowerCase() : "";
  const price = positiveMarketStat(next.price);
  const maxSupply = positiveMarketStat(next.maxSupply);
  const totalSupply = positiveMarketStat(next.totalSupply);
  if (next.fdvDerived === true && typeof next.fdvReason !== "string") {
    next.fdvReason = maxSupply != null
      ? "Fully diluted value is the price times the maximum supply. It was not sent as its own figure."
      : "Fully diluted value is the price times the total supply. It was not sent as its own figure.";
  }
  if (positiveMarketStat(next.fdv) == null && price != null) {
    const basis = maxSupply ?? totalSupply;
    if (basis != null) {
      next.fdv = price * basis;
      next.fdvDerived = true;
      next.fdvReason = maxSupply != null
        ? "Fully diluted value is the price times the maximum supply. It was not sent as its own figure."
        : "Fully diluted value is the price times the total supply. It was not sent as its own figure.";
    } else if (typeof next.symbol === "string" && next.symbol) {
      next.fdvReason = feedDidNotSend(source, "fully diluted value");
    }
  }
  const symbol = typeof next.symbol === "string" ? next.symbol : "";
  if (symbol) {
    if (positiveMarketStat(next.circulatingSupply) == null) {
      next.circulatingReason = feedDidNotSend(source, "circulating supply");
    }
    if (positiveMarketStat(next.high24h) == null) next.highReason = feedDidNotSend(source, "a 24-hour high");
    if (positiveMarketStat(next.low24h) == null) next.lowReason = feedDidNotSend(source, "a 24-hour low");
    if (positiveMarketStat(next.atl) == null) next.atlReason = feedDidNotSend(source, "an all-time low");
    const fed = typeof next.name === "string" ? next.name : "";
    next.name = coinDisplayName(symbol, fed);
    const chain = typeof next.blockchain === "string" ? next.blockchain.trim() : "";
    if (!chain || chain === "—" || chain === "Unavailable" || chain === "Native") {
      const filled = chainForTicker(symbol);
      if (filled) {
        next.blockchain = filled;
        next.blockchainReason = undefined;
      } else {
        next.blockchain = "";
        next.blockchainReason = feedDidNotSend(source, "a platform for this coin");
      }
    }
  }
  return next as T;
}

export function marketsBody(coins: unknown[] | null | undefined, notice: string | null, at?: string | null) {
  const stamp = typeof at === "string" && at.trim() ? at : undefined;
  if (!coins || coins.length === 0) {
    return stamp
      ? { ok: false as const, error: LIVE_CRYPTO_UNAVAILABLE, at: stamp }
      : { ok: false as const, error: LIVE_CRYPTO_UNAVAILABLE };
  }
  const data = coins.map((coin) =>
    coin && typeof coin === "object" ? presentMarketCoin(coin as { marketCap?: unknown; volume24h?: unknown }) : coin
  );
  return stamp
    ? { ok: true as const, data, total: data.length, notice, at: stamp }
    : { ok: true as const, data, total: data.length, notice };
}

export function dexBody(
  rows: unknown[] | null | undefined,
  opts?: { collecting?: boolean; notice?: string | null }
) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0 && !opts?.collecting) {
    return { ok: false as const, error: LIVE_DEX_UNAVAILABLE };
  }
  const notice =
    opts && "notice" in opts
      ? opts.notice ?? null
      : dexListNotice(list.length, false);
  return {
    ok: true as const,
    data: list,
    total: list.length,
    notice,
  };
}
