// Goal b16 G-02: store NZX 50 and S&P 500 daily closes in NZ$ from Yahoo Finance's
// public chart endpoint (delayed data). S&P 500 USD closes are converted at the same
// day's NZDUSD close (last close on or before that day). Writes src/data/benchmark-history.json.
// Run: node scripts/fetch-benchmark-history.mjs   (no keys needed)
import { writeFileSync } from "node:fs";

const START = Math.floor(Date.parse("2019-01-01T00:00:00Z") / 1000);
async function chart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${START}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 AetherForge benchmark fetch" } });
  if (!res.ok) throw new Error(`${symbol} HTTP ${res.status}`);
  const r = (await res.json()).chart.result[0];
  const off = r.meta.gmtoffset || 0;
  const closes = r.indicators.quote[0].close;
  const out = new Map();
  r.timestamp.forEach((t, i) => {
    const c = closes[i];
    if (c == null || !(c > 0)) return;
    out.set(new Date((t + off) * 1000).toISOString().slice(0, 10), c);
  });
  return out;
}
const [nz, sp, fx] = await Promise.all([chart("^NZ50"), chart("^GSPC"), chart("NZDUSD=X")]);
const fxDates = [...fx.keys()].sort();
const fxOn = (d) => {
  let lo = 0, hi = fxDates.length - 1, best = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (fxDates[m] <= d) { best = fxDates[m]; lo = m + 1; } else hi = m - 1; }
  return best ? fx.get(best) : null;
};
const nzPoints = [...nz.entries()].sort().map(([d, c]) => [d, Math.round(c * 100) / 100]);
const spPoints = [...sp.entries()].sort().flatMap(([d, c]) => { const r = fxOn(d); return r ? [[d, Math.round((c / r) * 100) / 100]] : []; });
const fetchedAt = new Date().toISOString();
const data = {
  source: "Yahoo Finance daily closes (delayed public data); S&P 500 converted to NZ$ at the NZDUSD close for the same day",
  fetchedAt,
  series: {
    nzx50: { name: "NZX 50", symbol: "^NZ50", currency: "NZD", asOf: nzPoints.at(-1)[0], points: nzPoints },
    sp500nzd: { name: "S&P 500 (in NZ$)", symbol: "^GSPC / NZDUSD=X", currency: "NZD", asOf: spPoints.at(-1)[0], points: spPoints },
  },
};
writeFileSync(new URL("../src/data/benchmark-history.json", import.meta.url), JSON.stringify(data));
console.log(`NZX 50 ${nzPoints.length} days to ${data.series.nzx50.asOf}; S&P 500 NZ$ ${spPoints.length} days to ${data.series.sp500nzd.asOf}`);
