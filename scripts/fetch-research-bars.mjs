import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Wider free universe for the monthly research study. Adjusted daily
 * closes from Yahoo chart, the same source as the round-1 file. A name
 * that Yahoo does not return is dropped and listed; nothing is filled in.
 */

const UA = "Mozilla/5.0 (compatible; AetherForgeResearch/1.0)";

const NZX = [
  "AIR", "FPH", "MEL", "SPK", "AIA", "MFT", "ATM", "FBU", "CEN", "EBO",
  "SKC", "MCY", "IFT", "VCT", "GNE", "KPG", "SUM", "RYM", "CNU", "FSF",
  "SKL", "NZX", "SKT", "OCA", "WHS", "THL", "SCL", "BGP", "ARG",
  "POT", "KMD", "VHP", "PEB", "HGH", "PCT", "SPG", "TRA", "IKE", "VGL", "HLG", "SAN",
];
const ASX = [
  "BHP", "CBA", "CSL", "WES", "FMG", "TLS", "WOW", "STO", "PLS", "XRO",
  "RSG", "MAH", "WBC", "NAB", "ANZ", "MQG", "GMG", "TCL", "WDS", "ALL",
  "RIO", "COL", "RMD", "COH", "QBE", "SUN", "IAG", "MIN", "JHX", "REA",
  "AMC", "BXB", "ORG", "S32", "FLT", "SEK", "CPU", "ASX", "APA", "WTC",
];
const US = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "UNH", "XOM"];
const ETF = ["SPY", "QQQ", "IWM", "EWA", "ENZL", "XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLB", "XLRE", "XLU", "XLC"];
const COINS = [
  "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "AVAX", "TRX", "DOT",
  "LINK", "TON", "SHIB", "BCH", "LTC", "UNI", "ATOM", "XLM", "NEAR", "APT",
  "FIL", "ICP", "HBAR", "ETC", "AAVE", "ALGO", "ARB", "OP", "INJ",
  "RENDER", "FET", "MKR",
];
/** Yahoo has no short ticker for these three. The ids are the listed coins. */
const COIN_ALIASES = ["UNI7083", "APT21794", "SUI20947"];

const BASKET = [
  ...NZX.map((s) => [`${s}.NZ`, "NZX"]),
  ...ASX.map((s) => [`${s}.AX`, "ASX"]),
  ...US.map((s) => [s, "US"]),
  ...ETF.map((s) => [s, "US"]),
  ...COINS.map((s) => [`${s}-USD`, "CRYPTO"]),
  ...COIN_ALIASES.map((s) => [`${s}-USD`, "CRYPTO"]),
];

async function yahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d&events=div%2Csplit`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${symbol} HTTP ${res.status}`);
  return res.json();
}

function rowsFromChart(symbol, market, json) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`${symbol} empty chart`);
  const ts = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  const byDate = new Map();
  for (let i = 0; i < ts.length; i++) {
    const raw = Number(quote.close?.[i]);
    const adjusted = Array.isArray(adj) ? Number(adj[i]) : NaN;
    const close = Number.isFinite(adjusted) && adjusted > 0 ? adjusted : raw;
    const volume = Number(quote.volume?.[i]);
    if (!(ts[i] > 0) || !(close > 0)) continue;
    const date = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    byDate.set(date, {
      symbol,
      market,
      date,
      close,
      volume: Number.isFinite(volume) && volume >= 0 ? volume : "",
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function one(symbol, market) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const json = await yahoo(symbol);
      const rows = rowsFromChart(symbol, market, json);
      if (rows.length < 80) throw new Error(`short series ${rows.length}`);
      return rows;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function main() {
  const dir = path.join(process.cwd(), "docs", "backtest");
  await mkdir(dir, { recursive: true });
  const lines = ["symbol,market,date,close,volume"];
  const failures = [];
  const concurrency = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < BASKET.length) {
      const index = cursor++;
      const [symbol, market] = BASKET[index];
      try {
        const rows = await one(symbol, market);
        for (const row of rows) lines.push(`${row.symbol},${row.market},${row.date},${row.close},${row.volume}`);
        console.log("OK", symbol, rows.length, rows[0].date, rows.at(-1).date);
      } catch (err) {
        failures.push({ symbol, error: String(err?.message || err) });
        console.error("FAIL", symbol, err?.message || err);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await writeFile(path.join(dir, "closes-r3.csv"), `${lines.join("\n")}\n`);
  await writeFile(path.join(dir, "closes-r3-failures.json"), JSON.stringify({ failures, requested: BASKET.length }, null, 2));
  console.log("symbols requested", BASKET.length, "failed", failures.length, "rows", lines.length - 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
