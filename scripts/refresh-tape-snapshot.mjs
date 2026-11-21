/**
 * Build-time tape snapshot. Prices come from Yahoo Finance spark, the same
 * keyless feed the live tape uses. Each row keeps that print's regularMarketTime
 * as quotedAt. A row with no vendor time is omitted. A failed fetch leaves the
 * last committed file in place.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "src/data/tape-build-snapshot.json");
const CHUNK = 20;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

function section(source, name) {
  const block = source.match(new RegExp(`${name}: \\[([\\s\\S]*?)\\n  \\],`));
  if (!block) throw new Error(`ticker list ${name} is missing`);
  const rows = [];
  for (const hit of block[1].matchAll(/symbol: "([^"]+)", name: "([^"]+)", currency: "([^"]+)"/g)) {
    rows.push({ symbol: hit[1], name: hit[2], currency: hit[3] });
  }
  if (!rows.length) throw new Error(`ticker list ${name} is empty`);
  return rows;
}

function yahooForCrypto(vendors, ticker) {
  const hit = vendors.match(new RegExp(`ticker: "${ticker}"[\\s\\S]*?yahoo: "([^"]+)"`));
  return hit ? hit[1] : null;
}

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isoFromUnix(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function nodesFromSpark(json) {
  const bySymbol = {};
  if (json?.spark?.result && Array.isArray(json.spark.result)) {
    for (const row of json.spark.result) {
      const resp = row?.response?.[0];
      if (!row?.symbol) continue;
      bySymbol[row.symbol] = {
        close: resp?.indicators?.quote?.[0]?.close,
        chartPreviousClose: resp?.meta?.chartPreviousClose ?? resp?.meta?.previousClose,
        previousClose: resp?.meta?.previousClose,
        fulldayPrice: resp?.meta?.regularMarketPrice ?? resp?.meta?.chartPreviousClose,
        regularMarketPrice: resp?.meta?.regularMarketPrice,
        regularMarketTime: resp?.meta?.regularMarketTime,
        timestamp: resp?.timestamp,
      };
    }
    return bySymbol;
  }
  if (json && typeof json === "object") return json;
  return bySymbol;
}

function resolveNode(node) {
  if (!node || typeof node !== "object") return null;
  const closes = (Array.isArray(node.close) ? node.close : []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const intraday = closes.length ? closes[closes.length - 1] : null;
  const session =
    positive(node.fulldayPrice) ?? positive(node.regularMarketPrice) ?? positive(node.chartPreviousClose) ?? positive(node.previousClose);
  const price = intraday ?? session;
  if (price == null) return null;
  const prev = positive(node.chartPreviousClose) ?? positive(node.previousClose) ?? (closes.length >= 2 ? closes[closes.length - 2] : null);
  const change = prev != null && prev > 0 ? ((price - prev) / prev) * 100 : 0;
  const times = Array.isArray(node.timestamp) ? node.timestamp : [];
  const quotedAt = isoFromUnix(node.regularMarketTime) ?? isoFromUnix(times.length ? times[times.length - 1] : null);
  if (!quotedAt) return null;
  return { price, change: Number.isFinite(change) ? change : 0, quotedAt };
}

async function spark(symbols) {
  const headers = { "User-Agent": UA, Accept: "application/json" };
  const qs = `?symbols=${encodeURIComponent(symbols.join(","))}&range=5d&interval=1d`;
  let res = await fetch(`https://query1.finance.yahoo.com/v7/finance/spark${qs}`, {
    headers,
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res || !res.ok) {
    res = await fetch(`https://query1.finance.yahoo.com/v8/finance/spark${qs}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
  }
  if (!res.ok) throw new Error(`Yahoo spark HTTP ${res.status}`);
  return nodesFromSpark(await res.json());
}

async function quotesFor(pairs) {
  const out = new Map();
  for (let i = 0; i < pairs.length; i += CHUNK) {
    const chunk = pairs.slice(i, i + CHUNK);
    const nodes = await spark(chunk.map((pair) => pair.yahoo));
    for (const pair of chunk) {
      const resolved = resolveNode(nodes[pair.yahoo]);
      if (resolved) out.set(pair.symbol, resolved);
    }
  }
  return out;
}

function toRow(symbol, quote) {
  return {
    symbol: symbol.symbol,
    name: symbol.name,
    price: quote.price,
    change: quote.change,
    currency: symbol.currency,
    provider: "Yahoo Finance",
    asOf: quote.quotedAt,
    quotedAt: quote.quotedAt,
  };
}

async function buildSnapshot() {
  const tape = readFileSync(join(root, "src/lib/ticker-feed.ts"), "utf8");
  const vendors = readFileSync(join(root, "src/lib/crypto-vendors.ts"), "utf8");
  const nzx = section(tape, "nzx");
  const asx = section(tape, "asx");
  const crypto = section(tape, "crypto").flatMap((row) => {
    const yahoo = yahooForCrypto(vendors, row.symbol);
    return yahoo ? [{ ...row, yahoo }] : [];
  });
  const equity = await quotesFor([...nzx, ...asx].map((row) => ({ ...row, yahoo: row.symbol })));
  const coins = await quotesFor(crypto);
  const nzxRows = nzx.map((row) => (equity.get(row.symbol) ? toRow(row, equity.get(row.symbol)) : null)).filter(Boolean);
  const asxRows = asx.map((row) => (equity.get(row.symbol) ? toRow(row, equity.get(row.symbol)) : null)).filter(Boolean);
  const cryptoRows = crypto.map((row) => (coins.get(row.symbol) ? toRow(row, coins.get(row.symbol)) : null)).filter(Boolean);
  if (!nzxRows.length || !asxRows.length) throw new Error("Yahoo returned no stamped NZX or ASX print");
  const quoted = [...nzxRows, ...asxRows].map((row) => row.quotedAt).sort();
  return {
    source:
      "Yahoo Finance spark (https://query1.finance.yahoo.com/v7/finance/spark, range=5d, interval=1d), written by scripts/refresh-tape-snapshot.mjs. quotedAt is Yahoo regularMarketTime. Rows without that time are omitted. A failed run keeps this file.",
    asOf: quoted[quoted.length - 1],
    rows: { nzx: nzxRows, asx: asxRows, crypto: cryptoRows },
    live: { crypto: cryptoRows.length > 0, equities: false },
    providers: { equities: "Yahoo Finance", crypto: cryptoRows.length ? "Yahoo Finance" : null },
  };
}

try {
  const next = await buildSnapshot();
  writeFileSync(outFile, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `[tape-snapshot] wrote ${next.rows.nzx.length} NZX, ${next.rows.asx.length} ASX, ${next.rows.crypto.length} crypto, asOf ${next.asOf}`,
  );
} catch (err) {
  console.error(
    `[tape-snapshot] refresh failed, keeping the last committed file: ${err instanceof Error ? err.message : "failed"}`,
  );
  process.exit(0);
}
