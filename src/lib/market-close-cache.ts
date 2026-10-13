/**
 * Per-exchange snapshot memory.
 * A closed exchange freezes on the date of its last completed session.
 * An open exchange keeps a short memory and is not reused once that session ends.
 */

import type { Exchange } from "@/lib/market-intel";
import {
  equitySessionDate,
  equitySessionOpen,
  equityVenue,
  exchangeFreshnessLabel,
  parseQuoteTime,
} from "@/lib/market-freshness";

export const OPEN_SNAPSHOT_TTL_MS = 45_000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface ExchangeQuoteStamp {
  quotedAt?: string | null;
  marketState?: string | null;
}

export interface FrozenExchangeBlock<T> {
  exchange: Exchange;
  /** Completed session date (yyyy-mm-dd). Null while the block was taken with the exchange open. */
  sessionDate: string | null;
  closed: boolean;
  indexPrice: number | null;
  moverCount: number;
  storedAtMs: number;
  block: T;
}

export function exchangeBlockCacheable(indexPrice: number | null, moverCount: number): boolean {
  return indexPrice != null && Number.isFinite(indexPrice) && indexPrice > 0 && moverCount > 0;
}

function isoFromFreshnessLabel(label: string): string | null {
  const match = label.match(/(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})/);
  if (!match) return null;
  const month = MONTHS.indexOf(match[2]) + 1;
  if (month < 1) return null;
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
}

/**
 * Date of the last completed session, or null while the exchange is still open
 * and Yahoo has not marked the print CLOSED.
 * A CLOSED print uses regularMarketTime. Otherwise the date is the one
 * exchangeFreshnessLabel names for the shut session.
 */
export function completedSessionDate(
  exchange: Exchange,
  now: Date,
  quote?: ExchangeQuoteStamp | null
): string | null {
  const quoteTime = parseQuoteTime(quote?.quotedAt ?? null);
  const yahooClosed = String(quote?.marketState || "").trim().toUpperCase() === "CLOSED";
  if (yahooClosed && quoteTime) return equitySessionDate(equityVenue(exchange), quoteTime);
  if (equitySessionOpen(exchange, now)) return null;
  const label = exchangeFreshnessLabel(exchange, now, quoteTime).label;
  return isoFromFreshnessLabel(label) ?? equitySessionDate(equityVenue(exchange), now);
}

export function rememberExchangeBlock<T>(input: {
  exchange: Exchange;
  now: Date;
  indexPrice: number | null;
  moverCount: number;
  quote?: ExchangeQuoteStamp | null;
  block: T;
}): FrozenExchangeBlock<T> | null {
  if (!exchangeBlockCacheable(input.indexPrice, input.moverCount)) return null;
  const open = equitySessionOpen(input.exchange, input.now);
  if (open) {
    return {
      exchange: input.exchange,
      sessionDate: null,
      closed: false,
      indexPrice: input.indexPrice,
      moverCount: input.moverCount,
      storedAtMs: input.now.getTime(),
      block: input.block,
    };
  }
  const sessionDate = completedSessionDate(input.exchange, input.now, input.quote);
  if (!sessionDate) return null;
  return {
    exchange: input.exchange,
    sessionDate,
    closed: true,
    indexPrice: input.indexPrice,
    moverCount: input.moverCount,
    storedAtMs: input.now.getTime(),
    block: input.block,
  };
}

/** A frozen close is reused only while that exchange is shut and the session date matches. An open block lasts 45s. */
export function reusableExchangeBlock<T>(
  stored: FrozenExchangeBlock<T> | null | undefined,
  now: Date
): T | null {
  if (!stored || !exchangeBlockCacheable(stored.indexPrice, stored.moverCount)) return null;
  const open = equitySessionOpen(stored.exchange, now);
  if (stored.closed) {
    if (open || !stored.sessionDate) return null;
    const session = completedSessionDate(stored.exchange, now);
    if (session !== stored.sessionDate) return null;
    return stored.block;
  }
  if (!open) return null;
  if (now.getTime() - stored.storedAtMs >= OPEN_SNAPSHOT_TTL_MS) return null;
  return stored.block;
}

/**
 * Keep a block that is still the right session. A failed build (null price or no movers)
 * is not stored, and it does not replace a block that is no longer reusable.
 */
export function commitExchangeBlock<T>(
  previous: FrozenExchangeBlock<T> | null,
  input: {
    exchange: Exchange;
    now: Date;
    indexPrice: number | null;
    moverCount: number;
    quote?: ExchangeQuoteStamp | null;
    block: T;
  }
): FrozenExchangeBlock<T> | null {
  if (previous && reusableExchangeBlock(previous, input.now)) return previous;
  return rememberExchangeBlock(input);
}
