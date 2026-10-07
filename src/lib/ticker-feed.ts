/**
 * One public tape. Rows are the symbol list only — prices come from the live
 * quote pipeline (Yahoo Finance / Twelve Data for equities, CoinGecko for
 * crypto). There is no second snapshot to mix in, and an empty quote map
 * stays empty instead of falling back to a demo book.
 */

import { cryptoFreshnessLabel, equitySessionOpen, latestQuoteTime } from "@/lib/market-freshness";

export interface TapeSymbol {
  symbol: string;
  name: string;
  currency: string;
}

export const TICKER_TAPE: { nzx: TapeSymbol[]; asx: TapeSymbol[]; crypto: TapeSymbol[] } = {
  nzx: [
    { symbol: "AIR.NZ", name: "Air New Zealand", currency: "NZD" },
    { symbol: "FPH.NZ", name: "Fisher & Paykel Health", currency: "NZD" },
    { symbol: "MEL.NZ", name: "Meridian Energy", currency: "NZD" },
    { symbol: "SPK.NZ", name: "Spark New Zealand", currency: "NZD" },
    { symbol: "CEN.NZ", name: "Contact Energy", currency: "NZD" },
    { symbol: "MCY.NZ", name: "Mercury NZ", currency: "NZD" },
    { symbol: "AIA.NZ", name: "Auckland Airport", currency: "NZD" },
    { symbol: "EBO.NZ", name: "Ebos Group", currency: "NZD" },
    { symbol: "MFT.NZ", name: "Mainfreight", currency: "NZD" },
    { symbol: "RYM.NZ", name: "Ryman Healthcare", currency: "NZD" },
    { symbol: "IFT.NZ", name: "Infratil", currency: "NZD" },
    { symbol: "FBU.NZ", name: "Fletcher Building", currency: "NZD" },
  ],
  asx: [
    { symbol: "TLX.AX", name: "Telix Pharmaceuticals", currency: "AUD" },
    { symbol: "BHP.AX", name: "BHP Group", currency: "AUD" },
    { symbol: "CBA.AX", name: "Commonwealth Bank", currency: "AUD" },
    { symbol: "CSL.AX", name: "CSL Limited", currency: "AUD" },
    { symbol: "NAB.AX", name: "National Australia Bank", currency: "AUD" },
    { symbol: "WBC.AX", name: "Westpac Banking", currency: "AUD" },
    { symbol: "WES.AX", name: "Wesfarmers", currency: "AUD" },
    { symbol: "MQG.AX", name: "Macquarie Group", currency: "AUD" },
    { symbol: "WOW.AX", name: "Woolworths Group", currency: "AUD" },
    { symbol: "FMG.AX", name: "Fortescue", currency: "AUD" },
    { symbol: "TLS.AX", name: "Telstra Group", currency: "AUD" },
  ],
  crypto: [
    { symbol: "BTC", name: "Bitcoin", currency: "USD" },
    { symbol: "ETH", name: "Ethereum", currency: "USD" },
    { symbol: "SOL", name: "Solana", currency: "USD" },
    { symbol: "XRP", name: "XRP", currency: "USD" },
    { symbol: "BNB", name: "BNB", currency: "USD" },
    { symbol: "ADA", name: "Cardano", currency: "USD" },
    { symbol: "DOGE", name: "Dogecoin", currency: "USD" },
    { symbol: "AVAX", name: "Avalanche", currency: "USD" },
    { symbol: "LINK", name: "Chainlink", currency: "USD" },
    { symbol: "DOT", name: "Polkadot", currency: "USD" },
    { symbol: "LTC", name: "Litecoin", currency: "USD" },
    { symbol: "MATIC", name: "Polygon (POL)", currency: "USD" },
  ],
};

export interface TapeQuote {
  price: number;
  changePct: number;
  provider?: string;
  /** Vendor quote time. The pipeline asOf is not copied here. */
  quotedAt?: string | null;
}

export interface TapeRow {
  symbol: string;
  name: string;
  price: number;
  change: number;
  currency: string;
  provider: string;
  asOf: string;
  quotedAt?: string | null;
}

export interface TickerTapeFeed {
  rows: { nzx: TapeRow[]; asx: TapeRow[]; crypto: TapeRow[] };
  /**
   * Crypto is true when a coin quote arrived.
   * Equities is true only while a quoted exchange (NZX or ASX) is in its regular session.
   */
  live: { crypto: boolean; equities: boolean };
  providers: { equities: string | null; crypto: string | null };
  /** ISO timestamp of this pipeline read. Null when nothing live was returned. */
  asOf: string | null;
}

export const CRYPTO_TAPE_PROVIDER = "CoinGecko";

/** Equities use Twelve Data only when that key is the configured provider. Otherwise Yahoo Finance. */
export function equityTapeProvider(env?: {
  MARKET_DATA_API_KEY?: string;
  MARKET_DATA_PROVIDER?: string;
}): string {
  const source = env ?? {
    MARKET_DATA_API_KEY: process.env.MARKET_DATA_API_KEY,
    MARKET_DATA_PROVIDER: process.env.MARKET_DATA_PROVIDER,
  };
  const key = source.MARKET_DATA_API_KEY?.trim();
  const provider = (source.MARKET_DATA_PROVIDER || "twelvedata").toLowerCase();
  if (key && provider === "twelvedata") return "Twelve Data";
  return "Yahoo Finance";
}

function takeLive(
  symbols: TapeSymbol[],
  quotes: Record<string, TapeQuote>,
  fallbackProvider: string,
  asOf: string
): TapeRow[] {
  const rows: TapeRow[] = [];
  for (const symbol of symbols) {
    const hit = quotes[symbol.symbol.toUpperCase()];
    const price = hit?.price;
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    const change = hit && Number.isFinite(hit.changePct) ? hit.changePct : 0;
    rows.push({
      symbol: symbol.symbol,
      name: symbol.name,
      price,
      change,
      currency: symbol.currency,
      provider: hit.provider?.trim() || fallbackProvider,
      asOf,
      quotedAt: hit.quotedAt ?? null,
    });
  }
  return rows;
}

/**
 * Build the tape from live quotes only. Symbols the pipeline did not price
 * are omitted. Nothing here invents a demo or cached stand-in price.
 */
export function composeTickerTape(input: {
  equityQuotes: Record<string, TapeQuote>;
  cryptoQuotes: Record<string, TapeQuote>;
  equityProvider: string;
  cryptoProvider: string;
  asOf: string;
  /** Session clock. Defaults to now so a closed exchange is not marked live. */
  now?: Date;
}): TickerTapeFeed {
  const nzx = takeLive(TICKER_TAPE.nzx, input.equityQuotes, input.equityProvider, input.asOf);
  const asx = takeLive(TICKER_TAPE.asx, input.equityQuotes, input.equityProvider, input.asOf);
  const crypto = takeLive(TICKER_TAPE.crypto, input.cryptoQuotes, input.cryptoProvider, input.asOf);
  const now = input.now ?? new Date();
  const equityRows = nzx.length + asx.length > 0;
  const equitiesLive =
    (nzx.length > 0 && equitySessionOpen("NZX", now)) || (asx.length > 0 && equitySessionOpen("ASX", now));
  const cryptoLive = crypto.length > 0;
  return {
    rows: { nzx, asx, crypto },
    live: { crypto: cryptoLive, equities: equitiesLive },
    providers: {
      equities: equityRows ? input.equityProvider : null,
      crypto: cryptoLive ? input.cryptoProvider : null,
    },
    asOf: equityRows || cryptoLive ? input.asOf : null,
  };
}

/** LIVE is only a crypto quote at most five minutes old. Equity rows never use it. */
export function tickerLiveLabel(feed: {
  live: { crypto: boolean; equities: boolean };
  rows?: { crypto?: Array<{ quotedAt?: string | null }> };
}): "LIVE" | null {
  if (!feed.live.crypto) return null;
  const latest = latestQuoteTime((feed.rows?.crypto ?? []).map((row) => row.quotedAt));
  return cryptoFreshnessLabel(latest).live ? "LIVE" : null;
}
