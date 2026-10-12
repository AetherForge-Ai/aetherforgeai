/**
 * Download delayed public daily bars for the Stox / Koins backtest.
 * Yahoo Finance chart API, adjusted close when Yahoo sends one.
 * This is not a licensed or real-time NZX/ASX feed.
 *
 * Usage: node scripts/fetch-backtest-bars.mjs
 * Writes docs/backtest/closes.csv and docs/backtest/quote-check.json
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

const BASKET = [
  ["AIR.NZ", "NZX"],
  ["FPH.NZ", "NZX"],
  ["MEL.NZ", "NZX"],
  ["SPK.NZ", "NZX"],
  ["AIA.NZ", "NZX"],
  ["MFT.NZ", "NZX"],
  ["ATM.NZ", "NZX"],
  ["FBU.NZ", "NZX"],
  ["CEN.NZ", "NZX"],
  ["EBO.NZ", "NZX"],
  ["BHP.AX", "ASX"],
  ["CBA.AX", "ASX"],
  ["CSL.AX", "ASX"],
  ["WES.AX", "ASX"],
  ["FMG.AX", "ASX"],
  ["TLS.AX", "ASX"],
  ["WOW.AX", "ASX"],
  ["STO.AX", "ASX"],
  ["PLS.AX", "ASX"],
  ["XRO.AX", "ASX"],
  ["RSG.AX", "ASX"],
  ["MAH.AX", "ASX"],
  ["AAPL", "US"],
  ["MSFT", "US"],
  ["NVDA", "US"],
  ["AMZN", "US"],
  ["GOOGL", "US"],
  ["JPM", "US"],
  ["XOM", "US"],
  ["JNJ", "US"],
  ["UNH", "US"],
  ["COST", "US"],
  ["BTC-USD", "CRYPTO"],
  ["ETH-USD", "CRYPTO"],
  ["SOL-USD", "CRYPTO"],
  ["BNB-USD", "CRYPTO"],
  ["XRP-USD", "CRYPTO"],
  ["ADA-USD", "CRYPTO"],
  ["DOGE-USD", "CRYPTO"],
  ["AVAX-USD", "CRYPTO"],
  ["LINK-USD", "CRYPTO"],
  ["DOT-USD", "CRYPTO"],
];

async function yahoo(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&events=div%2Csplit`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${symbol} ${range}/${interval} HTTP ${res.status}`);
  return res.json();
}

function rowsFromChart(symbol, market, json) {
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`${symbol} empty chart`);
  const ts = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const raw = Number(quote.close?.[i]);
    const adjusted = Array.isArray(adj) ? Number(adj[i]) : NaN;
    const close = Number.isFinite(adjusted) && adjusted > 0 ? adjusted : raw;
    const volume = Number(quote.volume?.[i]);
    if (!(ts[i] > 0) || !(close > 0)) continue;
    const date = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    out.push({
      symbol,
      market,
      date,
      close,
      volume: Number.isFinite(volume) && volume >= 0 ? volume : "",
    });
  }
  const byDate = new Map();
  for (const row of out) byDate.set(row.date, row);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function metaChange(json) {
  const meta = json?.chart?.result?.[0]?.meta || {};
  const price = Number(meta.regularMarketPrice);
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
  const reported = Number(meta.regularMarketChangePercent);
  const fromPrev = prev > 0 && price > 0 ? ((price - prev) / prev) * 100 : null;
  return {
    price: Number.isFinite(price) ? price : null,
    chartPreviousClose: Number.isFinite(prev) ? prev : null,
    regularMarketChangePercent: Number.isFinite(reported) ? reported : null,
    changeFromChartPreviousClose: fromPrev,
    currency: meta.currency || null,
    exchange: meta.exchangeName || null,
    quotedAt: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
  };
}

async function main() {
  const dir = path.join(process.cwd(), "docs", "backtest");
  await mkdir(dir, { recursive: true });
  const lines = ["symbol,market,date,close,volume"];
  const failures = [];
  for (const [symbol, market] of BASKET) {
    let lastErr;
    let rows = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const json = await yahoo(symbol, "5y", "1d");
        rows = rowsFromChart(symbol, market, json);
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    if (!rows || rows.length < 80) {
      failures.push({ symbol, error: String(lastErr || "short series"), bars: rows?.length || 0 });
      console.error("FAIL", symbol, lastErr);
      continue;
    }
    for (const row of rows) {
      lines.push(`${row.symbol},${row.market},${row.date},${row.close},${row.volume}`);
    }
    console.log("OK", symbol, rows.length, rows[0].date, rows[rows.length - 1].date);
  }

  const checks = {};
  for (const symbol of ["RSG.AX", "MAH.AX", "BHP.AX", "BTC-USD"]) {
    try {
      const [day, five, intraday] = await Promise.all([
        yahoo(symbol, "1d", "1d"),
        yahoo(symbol, "5d", "1d"),
        yahoo(symbol, "1d", "5m"),
      ]);
      const daily = rowsFromChart(symbol, "CHECK", five);
      const prior = daily.length >= 2 ? daily[daily.length - 2].close : null;
      const last = daily.length ? daily[daily.length - 1].close : null;
      const dailyChange = prior && last ? ((last - prior) / prior) * 100 : null;
      const spark = day?.chart?.result?.[0];
      const sparkCloses = (spark?.indicators?.quote?.[0]?.close || []).filter((n) => n > 0);
      const intra = intraday?.chart?.result?.[0];
      const intraTs = intra?.timestamp || [];
      const intraCloses = intra?.indicators?.quote?.[0]?.close || [];
      const points = [];
      for (let i = 0; i < intraTs.length; i++) {
        const price = Number(intraCloses[i]);
        if (intraTs[i] > 0 && price > 0) points.push({ t: intraTs[i] * 1000, price });
      }
      const lastPoint = points[points.length - 1];
      const hour = lastPoint ? points.filter((p) => p.t >= lastPoint.t - 60 * 60 * 1000) : [];
      const twelve = points.slice(-12);
      const hourPct =
        hour.length >= 2 ? ((hour[hour.length - 1].price - hour[0].price) / hour[0].price) * 100 : null;
      const twelvePct =
        twelve.length >= 2 ? ((twelve[twelve.length - 1].price - twelve[0].price) / twelve[0].price) * 100 : null;
      const spanMin =
        twelve.length >= 2 ? (twelve[twelve.length - 1].t - twelve[0].t) / 60000 : null;
      checks[symbol] = {
        oneDayMeta: metaChange(day),
        fiveMinuteMeta: metaChange(intraday),
        dailyPriorClose: prior,
        dailyLastClose: last,
        dailySessionChangePct: dailyChange,
        intradayPoints: points.length,
        lastHourPoints: hour.length,
        lastHourChangePct: hourPct,
        last12BarsChangePct: twelvePct,
        last12BarsSpanMinutes: spanMin,
      };
      console.log("CHECK", symbol, JSON.stringify(checks[symbol]));
    } catch (err) {
      checks[symbol] = { error: String(err) };
      console.error("CHECK FAIL", symbol, err);
    }
  }

  await writeFile(path.join(dir, "closes.csv"), lines.join("\n") + "\n");
  await writeFile(
    path.join(dir, "quote-check.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString(), source: "Yahoo Finance chart v8 (delayed public)", failures, checks }, null, 2) + "\n"
  );
  if (failures.length) {
    console.error("Failures", failures);
    process.exitCode = 1;
  }
}

main();
