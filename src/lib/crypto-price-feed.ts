/**
 * Server snapshot of the last crypto price that passed the sanity check.
 * A warm read returns immediately. A refresh runs in the background every 60s.
 * A cold read waits at most 3 seconds.
 *
 * pull-check:crypto-dex-400-2026-10-11
 * Production reads SWYFTX_API_KEY from Totalum env vars. This module never logs it.
 */

import "server-only";

import { dexPriceForSymbol, dexReserveUsd, DEX_LIQUIDITY_FLOOR_USD } from "@/lib/crypto-dex";
import { dexQuoteRows } from "@/lib/crypto-coingecko";
import { fetchSpotPrices } from "@/lib/crypto-swyftx";
import {
  CryptoPriceBook,
  type ChainCandidate,
  type ChainPrint,
  type ChainProvider,
} from "@/lib/crypto-price-chain";
import { gatePublicPrint, publicSourceAllowed, swyftxPublicDisplay } from "@/lib/swyftx-display";
import { CRYPTO_VENDORS, coingeckoIdFor, yahooSymbolFor } from "@/lib/crypto-vendors";
import type { PublicPriceTab } from "@/lib/public-market-types";
import { fetchYahooCryptoLiveQuotes } from "@/lib/yahoo-finance";

const FRESH_MS = 60_000;
const COLD_MS = 3_000;
const WARM_LIMIT = 20;
const CHAIN_TIMEOUT_MS = 2_500;

const KRAKEN_PAIR: Record<string, string> = {
  BTC: "XBTUSD",
  ETH: "ETHUSD",
  SOL: "SOLUSD",
  XRP: "XRPUSD",
  ADA: "ADAUSD",
  DOGE: "XDGUSD",
  LINK: "LINKUSD",
  DOT: "DOTUSD",
  LTC: "LTCUSD",
  ATOM: "ATOMUSD",
  AVAX: "AVAXUSD",
  BNB: "BNBUSD",
  UNI: "UNIUSD",
  NEAR: "NEARUSD",
  APT: "APTUSD",
};

const book = new CryptoPriceBook(buildProviders());
const tabs = new Map<string, PublicPriceTab>();
let warming = false;
let warmTimer: ReturnType<typeof setTimeout> | null = null;

function buildProviders(): ChainProvider[] {
  return [
    { id: "coingecko", quote: quoteCoinGecko },
    { id: "swyftx", available: () => swyftxPublicDisplay(), quote: quoteSwyftx },
    { id: "kraken", quote: quoteKraken },
    { id: "coinbase", quote: quoteCoinbase },
    { id: "yahoo", quote: quoteYahoo },
    { id: "geckoterminal", dexOnly: true, quote: quoteGeckoTerminal },
  ];
}

function symbolFor(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (CRYPTO_VENDORS[upper]) return upper;
  const slug = raw.toLowerCase();
  const hit = Object.values(CRYPTO_VENDORS).find((row) => row.coingecko === slug);
  return hit?.ticker ?? null;
}

function cgHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  return headers;
}

function isoFromUnix(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function cgSimple(ids: string[]): Promise<Record<string, ChainCandidate>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return {};
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    unique.join(",")
  )}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;
  const res = await fetch(url, { headers: cgHeaders(), signal: AbortSignal.timeout(CHAIN_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const json = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number; last_updated_at?: number }>;
  const out: Record<string, ChainCandidate> = {};
  for (const [id, row] of Object.entries(json)) {
    const price = Number(row?.usd);
    if (!(price > 0) || !Number.isFinite(price)) continue;
    const change = Number(row?.usd_24h_change);
    out[id] = {
      price,
      changePct: Number.isFinite(change) ? change : null,
      quotedAt: isoFromUnix(row?.last_updated_at),
      source: "coingecko",
    };
  }
  return out;
}

async function quoteCoinGecko(symbol: string): Promise<ChainCandidate | null> {
  const id = coingeckoIdFor(symbol);
  if (!id) return null;
  const rows = await cgSimple([id]);
  return rows[id] ?? null;
}

async function quoteSwyftx(symbol: string): Promise<ChainCandidate | null> {
  const spots = await fetchSpotPrices([symbol]);
  const hit = spots[symbol.toUpperCase()];
  if (!hit || !(hit.price > 0)) return null;
  return { price: hit.price, changePct: hit.changePct, source: "swyftx" };
}

async function quoteKraken(symbol: string): Promise<ChainCandidate | null> {
  const pair = KRAKEN_PAIR[symbol.toUpperCase()];
  if (!pair) return null;
  const res = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(CHAIN_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`kraken ${res.status}`);
  const json = (await res.json()) as { error?: string[]; result?: Record<string, { c?: string[]; o?: string }> };
  if (json.error?.length) return null;
  const row = Object.values(json.result || {})[0];
  const price = Number(row?.c?.[0]);
  const open = Number(row?.o);
  if (!(price > 0) || !Number.isFinite(price)) return null;
  const changePct = open > 0 ? ((price - open) / open) * 100 : null;
  return { price, changePct, source: "kraken" };
}

async function quoteCoinbase(symbol: string): Promise<ChainCandidate | null> {
  if (!CRYPTO_VENDORS[symbol.toUpperCase()]) return null;
  const product = `${symbol.toUpperCase()}-USD`;
  const res = await fetch(`https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/ticker`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(CHAIN_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`coinbase ${res.status}`);
  const json = (await res.json()) as { price?: string; time?: string };
  const price = Number(json.price);
  if (!(price > 0) || !Number.isFinite(price)) return null;
  return { price, quotedAt: json.time || null, source: "coinbase" };
}

async function quoteYahoo(symbol: string): Promise<ChainCandidate | null> {
  const mapped = yahooSymbolFor(symbol);
  if (!mapped.mapped) return null;
  const quotes = await fetchYahooCryptoLiveQuotes({ [symbol.toUpperCase()]: mapped.symbol });
  const hit = quotes[symbol.toUpperCase()];
  if (!hit || !(hit.price > 0)) return null;
  return { price: hit.price, changePct: hit.changePct, quotedAt: hit.quotedAt, source: "yahoo" };
}

async function quoteGeckoTerminal(symbol: string): Promise<ChainCandidate | null> {
  const rows = await dexQuoteRows(symbol);
  const qualified = rows.filter(
    (row) => row.symbol.toUpperCase() === symbol.toUpperCase() && dexReserveUsd(row) >= DEX_LIQUIDITY_FLOOR_USD
  );
  const price = dexPriceForSymbol(symbol, qualified);
  if (!(price != null && price > 0)) return null;
  return { price, source: "geckoterminal" };
}

function scheduleWarm() {
  if (warmTimer || warming) return;
  warmTimer = setTimeout(() => {
    warmTimer = null;
    void warmKnown().catch((err) => {
      console.error("[crypto-price] warm failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    });
  }, FRESH_MS);
  warmTimer.unref?.();
}

async function warmKnown() {
  if (warming) return;
  const symbols = book.symbols().slice(0, WARM_LIMIT);
  if (!symbols.length) return;
  warming = true;
  try {
    const ids = symbols.map((symbol) => coingeckoIdFor(symbol) || "");
    let batch: Record<string, ChainCandidate> = {};
    try {
      batch = await cgSimple(ids);
    } catch (err) {
      console.error("[crypto-price] CoinGecko warm failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    }
    const missed: string[] = [];
    symbols.forEach((symbol, index) => {
      const id = ids[index];
      const row = id ? batch[id] : undefined;
      if (row && acceptCryptoPrint(symbol, row, [], "coingecko")) return;
      missed.push(symbol);
    });
    for (const symbol of missed.slice(0, 8)) {
      await book.quote(symbol, { skip: ["coingecko"] });
    }
  } finally {
    warming = false;
    scheduleWarm();
  }
}

function publish(print: ChainPrint | null): ChainPrint | null {
  return gatePublicPrint(print);
}

export function acceptCryptoPrint(
  symbol: string,
  candidate: ChainCandidate,
  aliases: string[] = [],
  source = candidate.source || "coingecko"
): ChainPrint | null {
  if (!publicSourceAllowed(source) || !publicSourceAllowed(candidate.source)) return null;
  const print = book.acceptCandidate(symbol, { ...candidate, source }, aliases, source);
  if (print) scheduleWarm();
  return publish(print);
}

export function noteListedPrices(
  rows: Array<{
    symbol: string;
    id?: string | null;
    price: number;
    changePct?: number | null;
    quotedAt?: string | null;
    source: string;
  }>
) {
  for (const row of rows) {
    if (!(row.price > 0) || !Number.isFinite(row.price)) continue;
    acceptCryptoPrint(
      row.symbol,
      {
        price: row.price,
        changePct: row.changePct,
        quotedAt: row.quotedAt,
        source: row.source,
      },
      row.id ? [row.id] : [],
      row.source
    );
  }
}

export function rememberPublicTab(tab: PublicPriceTab) {
  if (!tab.rows.length) return;
  tabs.set(tab.id, tab);
}

export function recallPublicTab(id: string): PublicPriceTab | null {
  return tabs.get(id) ?? null;
}

export function staleCryptoPrint(key: string): ChainPrint | null {
  return publish(book.markStale(key));
}

/**
 * Symbols CoinGecko did not price. The chain continues at Swyftx (only when the
 * display flag is on), then Kraken, Coinbase, and mapped Yahoo.
 */
export async function fillMissingPublicQuotes(symbols: string[]): Promise<Record<string, ChainPrint>> {
  const out: Record<string, ChainPrint> = {};
  const queue = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const symbol = queue.shift();
      if (!symbol) return;
      try {
        const print = publish(await book.quote(symbol, { skip: ["coingecko"] }));
        if (print && print.price > 0 && !print.stale) out[symbol] = print;
      } catch (err) {
        console.error("[crypto-price] fill failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
      }
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Last good snapshot for a public coin page. Warm reads do not wait on the feeds.
 */
export async function loadPublicCryptoPrint(idOrSymbol: string): Promise<ChainPrint | null> {
  const raw = idOrSymbol.trim();
  if (!raw) return null;
  try {
    const cached = publish(book.peek(raw));
    if (cached && cached.price > 0 && Date.now() - cached.storedAt < FRESH_MS && !cached.stale) {
      scheduleWarm();
      return cached;
    }
    if (cached && cached.price > 0) {
      const symbol = cached.symbol;
      void book.quote(symbol).catch(() => null);
      scheduleWarm();
      return cached;
    }
    const symbol = symbolFor(raw);
    const job = symbol ? book.quote(symbol) : quoteUnknownSlug(raw);
    const raced = await Promise.race([
      job,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), COLD_MS)),
    ]);
    if (raced && raced.price > 0) {
      const shown = publish(raced);
      if (shown) {
        if (!symbol) book.remember(shown, [raw]);
        scheduleWarm();
        return shown;
      }
    }
    const last = publish(book.peek(raw) ?? (symbol ? book.peek(symbol) : null));
    return last && last.price > 0 ? publish(book.markStale(symbol || last.symbol)) : null;
  } catch (err) {
    console.error("[crypto-price] public quote failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    const last = publish(book.peek(raw));
    return last && last.price > 0 ? publish(book.markStale(last.symbol)) : null;
  }
}

async function quoteUnknownSlug(slug: string): Promise<ChainPrint | null> {
  const rows = await cgSimple([slug.toLowerCase()]);
  const row = rows[slug.toLowerCase()];
  if (!row) return null;
  const symbol = slug.includes("-") ? slug.split("-")[0].toUpperCase() : slug.toUpperCase();
  return acceptCryptoPrint(symbol, row, [slug], "coingecko");
}

/** One symbol through the chain, including the last good price when every source fails. */
export async function coverMissingCrypto(symbol: string, dex = false): Promise<ChainPrint | null> {
  const code = symbol.trim().toUpperCase();
  if (!code) return null;
  try {
    const raced = await Promise.race([
      book.quote(code, { dex }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), COLD_MS)),
    ]);
    if (raced && raced.price > 0) return publish(raced);
    return publish(book.markStale(code));
  } catch (err) {
    console.error("[crypto-price] cover failed:", err instanceof Error ? err.message.slice(0, 160) : "failed");
    return publish(book.markStale(code));
  }
}

