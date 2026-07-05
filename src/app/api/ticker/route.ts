import { NextResponse } from "next/server";
import { fetchCryptoQuotes, fetchLiveQuotes, isLiveDataConfigured } from "@/lib/market-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/ticker — data feed for the scrolling home banner.
 *
 * Three rows matching the sources the owner specified:
 *   • NZX 50   → https://www.nzx.com/markets/NZSX
 *   • ASX 200  → https://www.asx.com.au/markets/company/TLX
 *   • Crypto   → https://www.cmcmarkets.com/en-nz/lp/cryptocurrencies
 *
 * Crypto is genuinely LIVE via CoinGecko (keyless). NZX/ASX equities are
 * anchored to live quotes when a MARKET_DATA_API_KEY is configured (Twelve Data
 * covers NZX + ASX); otherwise they fall back to a curated snapshot of the
 * index constituents so the banner is never empty. Everything is server-side so
 * no data-provider key is ever exposed to the client.
 */

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number; // percent
  currency: string;
}

// NZX 50 constituents (NZD) — snapshot fallback.
const NZX: Quote[] = [
  { symbol: "AIR.NZ", name: "Air New Zealand", price: 0.68, change: 1.49, currency: "NZD" },
  { symbol: "FPH.NZ", name: "Fisher & Paykel Health", price: 36.8, change: 0.82, currency: "NZD" },
  { symbol: "MEL.NZ", name: "Meridian Energy", price: 6.15, change: -0.64, currency: "NZD" },
  { symbol: "SPK.NZ", name: "Spark New Zealand", price: 4.2, change: -1.18, currency: "NZD" },
  { symbol: "CEN.NZ", name: "Contact Energy", price: 9.34, change: 0.43, currency: "NZD" },
  { symbol: "MCY.NZ", name: "Mercury NZ", price: 6.02, change: 0.21, currency: "NZD" },
  { symbol: "AIA.NZ", name: "Auckland Airport", price: 7.58, change: 1.07, currency: "NZD" },
  { symbol: "EBO.NZ", name: "Ebos Group", price: 37.15, change: -0.35, currency: "NZD" },
  { symbol: "MFT.NZ", name: "Mainfreight", price: 68.4, change: 1.72, currency: "NZD" },
  { symbol: "RYM.NZ", name: "Ryman Healthcare", price: 3.28, change: -1.44, currency: "NZD" },
  { symbol: "IFT.NZ", name: "Infratil", price: 10.86, change: 0.66, currency: "NZD" },
  { symbol: "FBU.NZ", name: "Fletcher Building", price: 2.94, change: 2.08, currency: "NZD" },
];

// ASX 200 heavyweights (AUD) — snapshot fallback (TLX = Telix Pharmaceuticals,
// the company the owner linked).
const ASX: Quote[] = [
  { symbol: "TLX.AX", name: "Telix Pharmaceuticals", price: 26.4, change: 1.82, currency: "AUD" },
  { symbol: "BHP.AX", name: "BHP Group", price: 40.12, change: 0.94, currency: "AUD" },
  { symbol: "CBA.AX", name: "Commonwealth Bank", price: 158.7, change: -0.52, currency: "AUD" },
  { symbol: "CSL.AX", name: "CSL Limited", price: 236.5, change: 1.31, currency: "AUD" },
  { symbol: "NAB.AX", name: "National Australia Bank", price: 38.9, change: -0.28, currency: "AUD" },
  { symbol: "WBC.AX", name: "Westpac Banking", price: 33.44, change: 0.61, currency: "AUD" },
  { symbol: "WES.AX", name: "Wesfarmers", price: 75.2, change: 0.88, currency: "AUD" },
  { symbol: "MQG.AX", name: "Macquarie Group", price: 224.6, change: -0.73, currency: "AUD" },
  { symbol: "WOW.AX", name: "Woolworths Group", price: 30.15, change: 0.35, currency: "AUD" },
  { symbol: "FMG.AX", name: "Fortescue", price: 19.06, change: -1.62, currency: "AUD" },
  { symbol: "TLS.AX", name: "Telstra Group", price: 4.05, change: 0.5, currency: "AUD" },
];

// Cryptocurrencies (USD) — snapshot fallback; overridden by live CoinGecko.
const CRYPTO: Quote[] = [
  { symbol: "BTC", name: "Bitcoin", price: 96850, change: 2.14, currency: "USD" },
  { symbol: "ETH", name: "Ethereum", price: 3420, change: 1.58, currency: "USD" },
  { symbol: "SOL", name: "Solana", price: 198.4, change: 3.42, currency: "USD" },
  { symbol: "XRP", name: "XRP", price: 2.31, change: -1.05, currency: "USD" },
  { symbol: "BNB", name: "BNB", price: 612, change: 0.74, currency: "USD" },
  { symbol: "ADA", name: "Cardano", price: 0.92, change: -0.66, currency: "USD" },
  { symbol: "DOGE", name: "Dogecoin", price: 0.38, change: 4.12, currency: "USD" },
  { symbol: "AVAX", name: "Avalanche", price: 41.2, change: 1.9, currency: "USD" },
  { symbol: "LINK", name: "Chainlink", price: 22.8, change: 2.35, currency: "USD" },
  { symbol: "DOT", name: "Polkadot", price: 8.4, change: -0.42, currency: "USD" },
  { symbol: "LTC", name: "Litecoin", price: 108.5, change: 0.58, currency: "USD" },
  { symbol: "MATIC", name: "Polygon", price: 0.62, change: 1.14, currency: "USD" },
];

/** Overlay live quotes (price + change) onto a snapshot row, keyed by symbol. */
function applyLive(rows: Quote[], live: Record<string, { price: number; changePct: number }>): Quote[] {
  return rows.map((q) => {
    const hit = live[q.symbol.toUpperCase()];
    if (hit && hit.price > 0) {
      return { ...q, price: hit.price, change: isFinite(hit.changePct) ? hit.changePct : q.change };
    }
    return q;
  });
}

export async function GET() {
  let nzx = NZX;
  let asx = ASX;
  let crypto = CRYPTO;
  let cryptoLive = false;
  let equitiesLive = false;

  // Crypto — always live (CoinGecko, no key).
  try {
    const quotes = await fetchCryptoQuotes(CRYPTO.map((c) => c.symbol));
    if (Object.keys(quotes).length) {
      crypto = applyLive(CRYPTO, quotes);
      cryptoLive = true;
    }
  } catch (err) {
    console.error("[api/ticker] Crypto live fetch failed (using snapshot):", err);
  }

  // NZX + ASX — live only when a market-data key is configured.
  if (isLiveDataConfigured()) {
    try {
      const quotes = await fetchLiveQuotes([...NZX, ...ASX].map((q) => q.symbol));
      if (Object.keys(quotes).length) {
        nzx = applyLive(NZX, quotes);
        asx = applyLive(ASX, quotes);
        equitiesLive = true;
      }
    } catch (err) {
      console.error("[api/ticker] Equity live fetch failed (using snapshot):", err);
    }
  }

  console.log(
    `[api/ticker] Served rows — crypto ${cryptoLive ? "live" : "snapshot"}, equities ${equitiesLive ? "live" : "snapshot"}`
  );

  return NextResponse.json({
    ok: true,
    data: {
      rows: { nzx, asx, crypto },
      live: { crypto: cryptoLive, equities: equitiesLive },
      sources: {
        nzx: "https://www.nzx.com/markets/NZSX",
        asx: "https://www.asx.com.au/markets/company/TLX",
        crypto: "https://www.cmcmarkets.com/en-nz/lp/cryptocurrencies",
      },
    },
  });
}
