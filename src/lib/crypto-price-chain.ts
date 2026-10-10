/**
 * Ordered crypto price chain.
 * pull-check:crypto-dex-400-2026-10-11
 *
 * Spot order: CoinGecko, Swyftx, Kraken, Coinbase, Yahoo Finance.
 * Public callers omit Swyftx unless SWYFTX_PUBLIC_DISPLAY is on.
 * DEX adds GeckoTerminal first.
 * Binance, CoinPaprika, and CoinCap are not called: their display terms were not
 * confirmed for this page. A guessed Yahoo symbol is not used.
 *
 * A print more than CRYPTO_SANITY_RATIO away from the last good price, or from
 * another source in the same read, is dropped. It is not averaged and not shown.
 * When every provider fails, the last good print is returned with its as-of time.
 */

import { formatDisplayDateTime, formatUnitPrice } from "@/lib/currency";
import { CRYPTO_SANITY_RATIO } from "@/lib/crypto-tape";
import type { PublicPriceRow, PublicPriceTab } from "@/lib/public-market-types";

export const CHAIN_TIMEOUT_MS = 2_500;
export const CHAIN_FAILURES_BEFORE_OPEN = 2;
export const CHAIN_BACKOFF_MS = 60_000;

export const SPOT_PROVIDER_ORDER = ["coingecko", "swyftx", "kraken", "coinbase", "yahoo"] as const;
export const DEX_PROVIDER_ORDER = ["geckoterminal", ...SPOT_PROVIDER_ORDER] as const;

export interface ChainCandidate {
  price: number;
  changePct?: number | null;
  quotedAt?: string | null;
  source?: string;
}

export interface ChainPrint {
  symbol: string;
  price: number;
  changePct: number | null;
  quotedAt: string;
  source: string;
  stale: boolean;
  storedAt: number;
  id?: string;
}

export interface ChainProvider {
  id: string;
  /** DEX quotes only. Spot reads skip these. */
  dexOnly?: boolean;
  /** When this returns false the provider is not called and is not a failure. */
  available?: () => boolean;
  quote(symbol: string): Promise<ChainCandidate | null>;
}

export interface ChainOptions {
  now?: () => number;
  timeoutMs?: number;
  failuresBeforeOpen?: number;
  backoffMs?: number;
}

interface Breaker {
  failures: number;
  openUntil: number;
}

/** True when two positive prices stay within CRYPTO_SANITY_RATIO. */
export function chainPricesAgree(a: number, b: number, ratio = CRYPTO_SANITY_RATIO): boolean {
  if (!(a > 0) || !(b > 0) || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  const span = a > b ? a / b : b / a;
  return span <= ratio;
}

export function sourceLabel(source: string): string {
  switch (source) {
    case "coingecko":
      return "CoinGecko";
    case "swyftx":
      return "Swyftx";
    case "kraken":
      return "Kraken";
    case "coinbase":
      return "Coinbase";
    case "yahoo":
      return "Yahoo Finance";
    case "geckoterminal":
      return "GeckoTerminal";
    case "google":
      return "Google Finance";
    default:
      return source;
  }
}

/** Visitor line. Empty when the print is not a positive price. */
export function formatPublicCryptoPrice(print: ChainPrint): string {
  if (!(print.price > 0) || !Number.isFinite(print.price)) return "";
  const price = formatUnitPrice(print.price, "USD");
  if (!price || price === "—" || price === "US$0.00" || price === "$0.00") return "";
  const wall = formatDisplayDateTime(print.quotedAt);
  const asOf = wall === "—" ? "as of not stated by the vendor" : `as of ${wall}`;
  const stale = print.stale ? " · last good price" : "";
  return `${print.symbol} ${price} ${asOf} · ${sourceLabel(print.source)}${stale}`;
}

export function publicCryptoPriceText(prints: ChainPrint[]): string {
  return prints.map((print) => formatPublicCryptoPrice(print)).filter(Boolean).join("\n");
}

export function rowHasVisiblePrice(row: Pick<PublicPriceRow, "price" | "usd">): boolean {
  if (row.usd != null) return Number.isFinite(row.usd) && row.usd > 0;
  const text = (row.price || "").trim();
  if (!text || text === "—" || text === "0" || text === "0.00" || text === "US$0.00" || text === "$0.00") return false;
  return true;
}

/** One labelled line per row that still has a positive price. */
export function publicCryptoTableLines(tab: Pick<PublicPriceTab, "id" | "asOf" | "rows">): string[] {
  if (tab.id !== "CRYPTO" && tab.id !== "DEX") return [];
  const rows = tab.rows.filter((row) => rowHasVisiblePrice(row));
  if (!rows.length) return ["No earlier price is stored."];
  const asOf = tab.asOf.includes("as of") ? tab.asOf : `as of ${tab.asOf}`;
  return rows.map((row) => `${row.symbol} ${row.price} ${asOf}`);
}

export function withLastGoodPrices(tab: PublicPriceTab): PublicPriceTab {
  const rows = tab.rows.filter((row) => rowHasVisiblePrice(row));
  const asOf = tab.asOf.includes("last good price")
    ? tab.asOf.includes("as of")
      ? tab.asOf
      : `as of ${tab.asOf}`
    : `${tab.asOf.includes("as of") ? tab.asOf : `as of ${tab.asOf}`} · last good price`;
  return { ...tab, rows, asOf };
}

/**
 * Keep a live tab when it has prices. Otherwise republish the previous snapshot
 * with a last-good label. Never invent a zero row.
 */
export function choosePublicPriceTab(fresh: PublicPriceTab, last: PublicPriceTab | null): PublicPriceTab {
  const live = fresh.rows.filter((row) => rowHasVisiblePrice(row));
  if (live.length) return { ...fresh, rows: live };
  if (last && last.rows.some((row) => rowHasVisiblePrice(row))) return withLastGoodPrices(last);
  return {
    ...fresh,
    rows: [],
    asOf: fresh.asOf.includes("as of") ? fresh.asOf : "as of not stated by the vendor",
  };
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * In-process book of the last price that passed the sanity check.
 * Providers are injected so tests can fail each source without a network call.
 */
export class CryptoPriceBook {
  private last = new Map<string, ChainPrint>();
  private alias = new Map<string, string>();
  private breakers = new Map<string, Breaker>();
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly failuresBeforeOpen: number;
  private readonly backoffMs: number;

  constructor(
    private readonly providers: ChainProvider[],
    opts: ChainOptions = {}
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.timeoutMs = opts.timeoutMs ?? CHAIN_TIMEOUT_MS;
    this.failuresBeforeOpen = opts.failuresBeforeOpen ?? CHAIN_FAILURES_BEFORE_OPEN;
    this.backoffMs = opts.backoffMs ?? CHAIN_BACKOFF_MS;
  }

  symbols(): string[] {
    return [...this.last.keys()];
  }

  peek(key: string): ChainPrint | null {
    const symbol = this.resolve(key);
    if (!symbol) return null;
    return this.last.get(symbol) ?? null;
  }

  remember(print: ChainPrint, aliases: string[] = []): void {
    if (!(print.price > 0) || !Number.isFinite(print.price)) return;
    const symbol = print.symbol.trim().toUpperCase();
    if (!symbol) return;
    const stored: ChainPrint = { ...print, symbol, stale: print.stale, price: print.price };
    this.last.set(symbol, stored);
    this.bind(symbol, aliases);
  }

  markStale(key: string): ChainPrint | null {
    const symbol = this.resolve(key);
    if (!symbol) return null;
    const prev = this.last.get(symbol);
    if (!prev || !(prev.price > 0)) return null;
    const stale = { ...prev, stale: true };
    this.last.set(symbol, stale);
    return stale;
  }

  /**
   * Store a candidate when it agrees with the last good price.
   * An outlier is ignored. Returns null when nothing may be shown from this candidate.
   */
  acceptCandidate(symbol: string, candidate: ChainCandidate, aliases: string[] = [], sourceId = ""): ChainPrint | null {
    const code = symbol.trim().toUpperCase();
    if (!code || !(candidate.price > 0) || !Number.isFinite(candidate.price)) return null;
    const prev = this.last.get(code) ?? null;
    if (prev && !chainPricesAgree(prev.price, candidate.price)) return null;
    const print = this.toPrint(code, candidate, sourceId || candidate.source || "coingecko", false);
    this.last.set(code, print);
    this.bind(code, aliases);
    return print;
  }

  async quote(symbol: string, opts?: { dex?: boolean; now?: number; skip?: string[] }): Promise<ChainPrint | null> {
    const code = symbol.trim().toUpperCase();
    if (!code) return null;
    const now = opts?.now ?? this.now();
    const skip = new Set(opts?.skip ?? []);
    const last = this.last.get(code) ?? null;
    let held: { raw: ChainCandidate; source: string } | null = null;

    for (const provider of this.ordered(!!opts?.dex, skip)) {
      const raw = await this.callProvider(provider, code, now);
      if (!raw) continue;
      if (last && !chainPricesAgree(last.price, raw.price)) continue;
      if (!held) {
        held = { raw, source: provider.id };
        if (last) return this.store(code, raw, provider.id, false);
        continue;
      }
      if (chainPricesAgree(held.raw.price, raw.price)) {
        return this.store(code, held.raw, held.source, false);
      }
      held = null;
    }

    if (held) return this.store(code, held.raw, held.source, false);
    if (last && last.price > 0) return this.markStale(code);
    return null;
  }

  private ordered(dex: boolean, skip: Set<string>): ChainProvider[] {
    const list = this.providers.filter((provider) => !skip.has(provider.id) && provider.available?.() !== false);
    if (!dex) return list.filter((provider) => !provider.dexOnly);
    return [...list.filter((provider) => provider.dexOnly), ...list.filter((provider) => !provider.dexOnly)];
  }

  private async callProvider(provider: ChainProvider, symbol: string, now: number): Promise<ChainCandidate | null> {
    const breaker = this.breakers.get(provider.id);
    if (breaker && breaker.openUntil > now) return null;
    try {
      const raw = await withTimeout(provider.quote(symbol), this.timeoutMs);
      if (!raw || !(raw.price > 0) || !Number.isFinite(raw.price)) {
        this.noteFailure(provider.id, now);
        return null;
      }
      this.noteSuccess(provider.id);
      return raw;
    } catch {
      this.noteFailure(provider.id, now);
      return null;
    }
  }

  private noteFailure(id: string, now: number) {
    const prev = this.breakers.get(id) ?? { failures: 0, openUntil: 0 };
    const failures = prev.failures + 1;
    this.breakers.set(id, {
      failures,
      openUntil: failures >= this.failuresBeforeOpen ? now + this.backoffMs : 0,
    });
  }

  private noteSuccess(id: string) {
    this.breakers.set(id, { failures: 0, openUntil: 0 });
  }

  private store(symbol: string, raw: ChainCandidate, source: string, stale: boolean): ChainPrint {
    const print = this.toPrint(symbol, raw, source, stale);
    this.last.set(symbol, print);
    return print;
  }

  private toPrint(symbol: string, raw: ChainCandidate, source: string, stale: boolean): ChainPrint {
    const quotedAt = raw.quotedAt && !Number.isNaN(new Date(raw.quotedAt).getTime()) ? raw.quotedAt : new Date(this.now()).toISOString();
    return {
      symbol,
      price: raw.price,
      changePct: raw.changePct == null || !Number.isFinite(raw.changePct) ? null : raw.changePct,
      quotedAt,
      source: raw.source || source,
      stale,
      storedAt: this.now(),
    };
  }

  private bind(symbol: string, aliases: string[]) {
    this.alias.set(symbol.toLowerCase(), symbol);
    for (const alias of aliases) {
      const key = alias.trim().toLowerCase();
      if (key) this.alias.set(key, symbol);
    }
  }

  private resolve(key: string): string | null {
    const raw = key.trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    if (this.last.has(upper)) return upper;
    const alias = this.alias.get(raw.toLowerCase());
    if (alias && this.last.has(alias)) return alias;
    return null;
  }
}
