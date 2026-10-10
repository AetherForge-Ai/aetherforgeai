/**
 * Shareable Markets detail URLs.
 *
 * Crypto uses the CoinGecko id already stored on market rows.
 * Stocks use the internal ticker the stock-detail API already accepts
 * (FPH.NZ, BHP.AX, AAPL).
 */

import {
  resolvableCoinId,
  COIN_DETAIL_UNAVAILABLE,
} from "@/lib/crypto-market";
import type { Exchange } from "@/lib/market-intel";

export { resolvableCoinId, COIN_DETAIL_UNAVAILABLE };

export const STOCK_DETAIL_UNAVAILABLE = "Live data for this ticker is not shown right now.";

export type MarketsTab = Exchange | "CRYPTO" | "DEX";

const EXCHANGE_LABEL: Record<Exchange, string> = {
  NZX: "NZX",
  ASX: "ASX",
  DOW: "Dow Jones",
  NASDAQ: "NASDAQ",
};

/** Yahoo / internal equity ticker: FPH.NZ, BHP.AX, BRK-B, AAPL. */
const STOCK_TICKER = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;

export function normalizeStockTicker(ticker: string | null | undefined): string | null {
  let raw = ticker || "";
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  raw = raw.trim().toUpperCase();
  if (!STOCK_TICKER.test(raw) || raw.includes("..")) return null;
  return raw;
}

export function parseExchange(value: string | null | undefined): Exchange | null {
  const v = (value || "").trim().toUpperCase();
  if (v === "NZX" || v === "ASX" || v === "DOW" || v === "NASDAQ") return v;
  return null;
}

/** Suffix is enough for NZX and ASX. A bare US ticker can sit on Dow or NASDAQ. */
export function exchangeFromTicker(ticker: string): Exchange | null {
  const symbol = normalizeStockTicker(ticker);
  if (!symbol) return null;
  if (symbol.endsWith(".NZ")) return "NZX";
  if (symbol.endsWith(".AX")) return "ASX";
  return null;
}

export function exchangeLabel(exchange: Exchange): string {
  return EXCHANGE_LABEL[exchange];
}

export function marketsTabHref(tab: MarketsTab): string {
  const q = tab === "CRYPTO" ? "crypto" : tab === "DEX" ? "dex" : tab.toLowerCase();
  return `/markets?tab=${q}`;
}

export function parseMarketsTab(value: string | null | undefined): MarketsTab | null {
  const v = (value || "").trim().toLowerCase();
  if (v === "crypto") return "CRYPTO";
  if (v === "dex") return "DEX";
  if (v === "nzx" || v === "asx" || v === "dow" || v === "nasdaq") return v.toUpperCase() as Exchange;
  return null;
}

export function cryptoDetailHref(id: string, opts?: { buy?: boolean }): string {
  const coin = resolvableCoinId(id);
  if (!coin) return unavailableCryptoHref();
  return `/markets/crypto/${encodeURIComponent(coin)}${opts?.buy ? "?buy=1" : ""}`;
}

export function unavailableCryptoHref(opts?: { symbol?: string; name?: string }): string {
  const params = new URLSearchParams();
  const symbol = (opts?.symbol || "").replace(/[^A-Za-z0-9.-]/g, "").slice(0, 16);
  const name = (opts?.name || "").replace(/[<>]/g, "").trim().slice(0, 80);
  if (symbol) params.set("symbol", symbol);
  if (name) params.set("name", name);
  const q = params.toString();
  return `/markets/crypto/unavailable${q ? `?${q}` : ""}`;
}

export function stockDetailHref(
  ticker: string,
  opts?: { exchange?: Exchange | null; buy?: boolean }
): string {
  const symbol = normalizeStockTicker(ticker);
  const fromSuffix = symbol ? exchangeFromTicker(symbol) : null;
  const exchange = fromSuffix ?? opts?.exchange ?? null;
  if (!symbol) return exchange ? marketsTabHref(exchange) : "/markets";
  const params = new URLSearchParams();
  if (exchange) params.set("exchange", exchange);
  if (opts?.buy) params.set("buy", "1");
  const q = params.toString();
  return `/markets/stock/${encodeURIComponent(symbol)}${q ? `?${q}` : ""}`;
}

export function stockBackHref(ticker: string, exchange?: Exchange | null): { href: string; label: string } {
  const resolved = exchange ?? exchangeFromTicker(ticker);
  if (!resolved) return { href: "/markets", label: "Markets · Stocks" };
  return { href: marketsTabHref(resolved), label: `Markets · ${exchangeLabel(resolved)}` };
}

/** Where a MarketsExplorer row click goes. A crypto row without a slug does not open a blank modal. */
export function explorerDetailHref(
  row: {
    coinId?: string | null;
    ticker: string;
    symbol: string;
    name?: string;
    exchange?: Exchange | null;
  },
  opts?: { buy?: boolean; asset?: "crypto" | "stock"; fallbackExchange?: Exchange | null }
): string {
  if (row.coinId || opts?.asset === "crypto") {
    const id = resolvableCoinId(row.coinId);
    if (!id) return unavailableCryptoHref({ symbol: row.symbol, name: row.name });
    return cryptoDetailHref(id, { buy: opts?.buy });
  }
  return stockDetailHref(row.ticker, {
    exchange: row.exchange ?? opts?.fallbackExchange ?? null,
    buy: opts?.buy,
  });
}

/** Short label for the unavailable page. Display only — never a price. */
export function unavailableTokenLabel(symbol?: string | null, name?: string | null): string | null {
  const sym = (symbol || "").replace(/[^A-Za-z0-9.-]/g, "").slice(0, 16);
  const nm = (name || "").replace(/[<>]/g, "").trim().slice(0, 80);
  if (nm && sym && nm.toUpperCase() !== sym.toUpperCase()) return `${nm} (${sym})`;
  return nm || sym || null;
}
