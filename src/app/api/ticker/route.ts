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

// NZX 50 constituents (NZD) — snapshot seed, overridden live by Yahoo Finance.
// Values anchored to real Yahoo quotes so the tape is accurate even pre-hydration.
const NZX: Quote[] = [
  { symbol: "AIR.NZ", name: "Air New Zealand", price: 0.445, change: -1.11, currency: "NZD" },
  { symbol: "FPH.NZ", name: "Fisher & Paykel Health", price: 40.35, change: 1.61, currency: "NZD" },
  { symbol: "MEL.NZ", name: "Meridian Energy", price: 5.7, change: 0.88, currency: "NZD" },
  { symbol: "SPK.NZ", name: "Spark New Zealand", price: 1.86, change: 0.27, currency: "NZD" },
  { symbol: "CEN.NZ", name: "Contact Energy", price: 9.35, change: 0.86, currency: "NZD" },
  { symbol: "MCY.NZ", name: "Mercury NZ", price: 6.9, change: 0.88, currency: "NZD" },
  { symbol: "AIA.NZ", name: "Auckland Airport", price: 8.67, change: 0.81, currency: "NZD" },
  { symbol: "EBO.NZ", name: "Ebos Group", price: 21.49, change: 2.43, currency: "NZD" },
  { symbol: "MFT.NZ", name: "Mainfreight", price: 64.29, change: 0.96, currency: "NZD" },
  { symbol: "RYM.NZ", name: "Ryman Healthcare", price: 2.21, change: 1.38, currency: "NZD" },
  { symbol: "IFT.NZ", name: "Infratil", price: 15.42, change: 1.98, currency: "NZD" },
  { symbol: "FBU.NZ", name: "Fletcher Building", price: 3.38, change: 0, currency: "NZD" },
];

// ASX 200 heavyweights (AUD) — snapshot seed, overridden live by Yahoo Finance
// (TLX = Telix Pharmaceuticals, the company the owner linked).
const ASX: Quote[] = [
  { symbol: "TLX.AX", name: "Telix Pharmaceuticals", price: 17.38, change: 2.96, currency: "AUD" },
  { symbol: "BHP.AX", name: "BHP Group", price: 60.02, change: -0.79, currency: "AUD" },
  { symbol: "CBA.AX", name: "Commonwealth Bank", price: 164.66, change: -0.22, currency: "AUD" },
  { symbol: "CSL.AX", name: "CSL Limited", price: 124.23, change: 1.99, currency: "AUD" },
  { symbol: "NAB.AX", name: "National Australia Bank", price: 38.65, change: 0.21, currency: "AUD" },
  { symbol: "WBC.AX", name: "Westpac Banking", price: 35.29, change: -1.12, currency: "AUD" },
  { symbol: "WES.AX", name: "Wesfarmers", price: 89.04, change: 0.9, currency: "AUD" },
  { symbol: "MQG.AX", name: "Macquarie Group", price: 250.73, change: -0.37, currency: "AUD" },
  { symbol: "WOW.AX", name: "Woolworths Group", price: 39.37, change: -1.03, currency: "AUD" },
  { symbol: "FMG.AX", name: "Fortescue", price: 18.52, change: 0.87, currency: "AUD" },
  { symbol: "TLS.AX", name: "Telstra Group", price: 4.99, change: 0.2, currency: "AUD" },
];

// Cryptocurrencies (USD) — snapshot seed; overridden live by CoinGecko/Yahoo.
const CRYPTO: Quote[] = [
  { symbol: "BTC", name: "Bitcoin", price: 63031, change: -0.88, currency: "USD" },
  { symbol: "ETH", name: "Ethereum", price: 1772.2, change: -0.67, currency: "USD" },
  { symbol: "SOL", name: "Solana", price: 80.78, change: -0.81, currency: "USD" },
  { symbol: "XRP", name: "XRP", price: 1.1452, change: -0.93, currency: "USD" },
  { symbol: "BNB", name: "BNB", price: 582.2, change: -1.15, currency: "USD" },
  { symbol: "ADA", name: "Cardano", price: 0.1842, change: -2.72, currency: "USD" },
  { symbol: "DOGE", name: "Dogecoin", price: 0.07695, change: -1.01, currency: "USD" },
  { symbol: "AVAX", name: "Avalanche", price: 6.94, change: 0.33, currency: "USD" },
  { symbol: "LINK", name: "Chainlink", price: 7.949, change: -1.31, currency: "USD" },
  { symbol: "DOT", name: "Polkadot", price: 0.868, change: -1.28, currency: "USD" },
  { symbol: "LTC", name: "Litecoin", price: 44.9, change: -1.8, currency: "USD" },
  { symbol: "MATIC", name: "Polygon", price: 0.2182, change: 2.57, currency: "USD" },
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
