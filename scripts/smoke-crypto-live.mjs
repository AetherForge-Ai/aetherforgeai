#!/usr/bin/env node
/**
 * Smoke: Swyftx + Yahoo crypto live paths (CoinGecko may 429).
 * Exits non-zero if BTC/ETH/SOL/APT/UNI/ARB cannot be priced.
 */
const needed = ["BTC", "ETH", "SOL", "APT", "UNI", "ARB", "OP"];

async function swyftxSpot() {
  const basicRes = await fetch("https://api.swyftx.com.au/markets/info/basic/", {
    headers: { Accept: "application/json", "User-Agent": "AetherForgeSmoke/1.0" },
  });
  const ratesRes = await fetch("https://api.swyftx.com.au/live-rates/36/", {
    headers: { Accept: "application/json", "User-Agent": "AetherForgeSmoke/1.0" },
  });
  if (!basicRes.ok || !ratesRes.ok) throw new Error(`Swyftx HTTP ${basicRes.status}/${ratesRes.status}`);
  const basic = await basicRes.json();
  const rates = await ratesRes.json();
  const by = Object.fromEntries(basic.filter((b) => b.code).map((b) => [b.code.toUpperCase(), b]));
  const out = {};
  for (const c of needed) {
    const b = by[c];
    if (!b) continue;
    const mid = Number(rates[String(b.id)]?.midPrice);
    if (mid > 0) out[c] = mid;
  }
  return out;
}

async function yahooSpot(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}-USD?range=5d&interval=1d`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 AetherForgeSmoke/1.0" },
  });
  if (!res.ok) return null;
  const j = await res.json();
  const p = Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice);
  return p > 0 ? p : null;
}

let failed = 0;
const sx = await swyftxSpot().catch((e) => {
  console.error("Swyftx failed", e.message);
  return {};
});
console.log("Swyftx:", sx);
for (const c of needed) {
  let p = sx[c];
  if (!(p > 0)) p = await yahooSpot(c);
  if (p > 0) console.log("OK", c, p);
  else {
    console.error("FAIL", c, "no live price");
    failed++;
  }
}
// Sanity band checks for ledger
if (sx.APT && (sx.APT < 0.05 || sx.APT > 50)) {
  console.error("FAIL APT spot looks wrong", sx.APT);
  failed++;
} else if (sx.APT) console.log("OK APT spot in sane band", sx.APT);
if (sx.UNI && sx.UNI < 0.5) {
  console.error("FAIL UNI spot too low", sx.UNI);
  failed++;
} else if (sx.UNI) console.log("OK UNI spot", sx.UNI);

process.exit(failed ? 1 : 0);
