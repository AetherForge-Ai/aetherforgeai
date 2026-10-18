/**
 * Per-market freshness labels.
 *
 * Equity sessions reuse the existing cash-session hours. The word "Live" is
 * reserved for a crypto quote that is at most five minutes old.
 *
 * TODO(owner): share-price vendor and any Yahoo licence are unconfirmed.
 * These labels name the exchange and the quote time only — do not invent a vendor.
 * TODO(owner): FX vendor is unconfirmed. Public copy says "Daily rate" only.
 * TODO(owner): metals vendor is unconfirmed. Do not label metals "Live".
 */

import { formatDisplayDate, formatDisplayDateTime } from "@/lib/currency";
import { isExchangeRegularSession, type Exchange } from "@/lib/market-intel";

export const PL_AT_LATEST_PRICE = "P/L at latest available price";
export const CRYPTO_QUOTE_FRESH_MS = 5 * 60 * 1000;

export type EquityVenue = "NZX" | "ASX" | "US";

const ZONE: Record<EquityVenue, string> = {
  NZX: "Pacific/Auckland",
  ASX: "Australia/Sydney",
  US: "America/New_York",
};

const OPEN_MINUTES: Record<EquityVenue, number> = {
  NZX: 10 * 60,
  ASX: 10 * 60,
  US: 9 * 60 + 30,
};

export function equityVenue(exchange: Exchange): EquityVenue {
  if (exchange === "NZX") return "NZX";
  if (exchange === "ASX") return "ASX";
  return "US";
}

/** True only while that cash session is open. Crypto and FX are not equity sessions. */
export function equitySessionOpen(exchange: Exchange, now = new Date()): boolean {
  return isExchangeRegularSession(exchange, now);
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return {
    iso: `${year}-${month}-${day}`,
    weekday: get("weekday"),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekdayIndex(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function previousWeekday(iso: string): string {
  let cursor = shiftIso(iso, -1);
  while (weekdayIndex(cursor) === 0 || weekdayIndex(cursor) === 6) cursor = shiftIso(cursor, -1);
  return cursor;
}

/** Calendar date of the session whose close (or open print) this instant belongs to. */
export function equitySessionDate(venue: EquityVenue, now = new Date()): string {
  const zone = ZONE[venue];
  const wall = zonedParts(now, zone);
  const weekday = weekdayIndex(wall.iso);
  const weekend = weekday === 0 || weekday === 6;
  if (weekend || wall.minutes < OPEN_MINUTES[venue]) return previousWeekday(wall.iso);
  return wall.iso;
}

export function formatSessionDate(iso: string): string {
  return formatDisplayDate(iso);
}

export type TapeVenue = "NZX" | "ASX" | "CRYPTO";

/** Home tape stamp. A shut equity session is the previous close, not a raw timestamp. */
export function tapeUpdatedPhrase(
  quotedAt: string | null | undefined,
  venue: TapeVenue,
  now = new Date()
): string {
  if (!quotedAt) return "last updated unavailable";
  if (venue === "NZX" || venue === "ASX") {
    if (!equitySessionOpen(venue, now)) {
      const date = formatDisplayDate(quotedAt);
      return date === "—" ? "Close unavailable" : `Close ${date}`;
    }
  }
  const wall = formatDisplayDateTime(quotedAt);
  return wall === "—" ? "last updated unavailable" : `last updated ${wall}`;
}

const ZONE_SUFFIX: Record<string, string> = {
  "Pacific/Auckland": "NZ",
  "America/New_York": "New York",
  "Australia/Sydney": "Sydney",
};

/** Hour and minute from formatToParts, with a fixed zone word. Server and browser agree. */
function formatQuoteClock(quotedAt: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(quotedAt);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(read("hour"));
  const minute = read("minute").padStart(2, "0");
  const period = read("dayPeriod").replace(/\./g, "").toLowerCase();
  if (!Number.isFinite(hour)) return "";
  if (hour === 0) hour = 12;
  const suffix = period.startsWith("a") ? "am" : period.startsWith("p") ? "pm" : period;
  const zone = ZONE_SUFFIX[timeZone] || "";
  return zone ? `${hour}:${minute} ${suffix} ${zone}` : `${hour}:${minute} ${suffix}`;
}

export function parseQuoteTime(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Open-session delay words (H-1). One table, used by every view and by /trust.
 * Yahoo's delay table (docs/data-licensing-options-2026-10-11.md) lists NZX and
 * ASX at 20 min. US prints carry the plain word "Delayed": we do not print a
 * minute figure the vendor has not stated for that feed.
 */
export const QUOTE_DELAY_WORDS: Record<EquityVenue, string> = {
  NZX: "Delayed ~20 min",
  ASX: "Delayed ~20 min",
  US: "Delayed",
};

export const QUOTE_DELAY_TABLE: ReadonlyArray<{ market: string; source: string; delay: string }> = [
  { market: "NZX shares", source: "Yahoo Finance", delay: "about 20 minutes while the market is open; last close otherwise" },
  { market: "ASX shares", source: "Yahoo Finance", delay: "about 20 minutes while the market is open; last close otherwise" },
  { market: "US shares", source: "Yahoo Finance", delay: "delayed while the market is open (the vendor does not state a fixed figure); last close otherwise" },
  // b38 H-15: every live crypto source is named (TT: Yahoo Finance served most crypto loads, unnamed here).
  { market: "Crypto", source: "CoinGecko first; CoinPaprika, CoinCap, Binance, Kraken, Coinbase or Yahoo Finance when it does not answer", delay: "a few minutes; a quote older than 5 minutes is labelled with its age" },
  { market: "DEX tokens", source: "GeckoTerminal; DexPaprika when it does not answer", delay: "a few minutes; a quote older than 5 minutes is labelled with its age" },
];

function openDelayWords(venue: EquityVenue): string {
  return QUOTE_DELAY_WORDS[venue];
}

/**
 * Equity label. Open sessions are delayed, never "Live".
 * A missing quote clock is left off — the fetch time is not substituted.
 */
export function equityFreshnessLabel(
  venue: EquityVenue,
  now = new Date(),
  quotedAt?: Date | null
): { label: string; live: false } {
  const exchange: Exchange = venue === "US" ? "DOW" : venue;
  if (equitySessionOpen(exchange, now)) {
    const name = venue === "US" ? "US" : venue;
    const clock = quotedAt ? formatQuoteClock(quotedAt, ZONE[venue]) : "";
    const delay = openDelayWords(venue);
    return {
      label: clock ? `${delay} · ${name} · quote ${clock}` : `${delay} · ${name}`,
      live: false,
    };
  }
  const date = formatSessionDate(equitySessionDate(venue, now));
  if (venue === "US") return { label: `Last close · ${date} (New York)`, live: false };
  return { label: `Close · ${venue} · ${date}`, live: false };
}

export function exchangeFreshnessLabel(
  exchange: Exchange,
  now = new Date(),
  quotedAt?: Date | null
): { label: string; live: false } {
  return equityFreshnessLabel(equityVenue(exchange), now, quotedAt);
}

/** API `live` is true only while that equity session is open and a quote arrived. */
export function equityApiLive(exchange: Exchange, quoted: boolean, now = new Date()): boolean {
  return quoted && equitySessionOpen(exchange, now);
}

/** True when at least one quoted equity venue is inside its regular session. */
export function quotedEquitySessionOpen(markets: ReadonlyArray<string>, now = new Date()): boolean {
  for (const market of markets) {
    const exchange: Exchange | null =
      market === "NZX" ? "NZX" : market === "ASX" ? "ASX" : market === "US" || market === "DOW" || market === "NASDAQ" ? "DOW" : null;
    if (exchange && equitySessionOpen(exchange, now)) return true;
  }
  return false;
}

export function cryptoFreshnessLabel(
  quotedAt: Date | null,
  now = new Date()
): { label: string; live: boolean } {
  if (!quotedAt) return { label: "Last updated: unavailable", live: false };
  const age = now.getTime() - quotedAt.getTime();
  const clock = formatQuoteClock(quotedAt, "Pacific/Auckland");
  if (age >= 0 && age <= CRYPTO_QUOTE_FRESH_MS) {
    return { label: `Live · crypto · updated ${clock}`, live: true };
  }
  // Older than the fresh window: say so, so a 2-hour-old crypto print is not read as current.
  // H-1: say how old it is, so a lagging snapshot is never read as current.
  return { label: `Delayed · updated ${clock} (${quoteAgeWords(age)})`, live: false };
}

/** "12 min ago", "1 h 38 min ago", "2 days ago". Negative ages read "just now". */
export function quoteAgeWords(ageMs: number): string {
  if (!(ageMs > 60_000)) return "just now";
  const mins = Math.floor(ageMs / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return mins % 60 ? `${hours} h ${mins % 60} min ago` : `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** FX is a daily rate. The API live flag stays false. */
export function dailyRateLabel(asOf: Date | string | null | undefined): string {
  const date = parseQuoteTime(asOf ?? null);
  if (!date) return "Daily rate";
  const wall = zonedParts(date, "Pacific/Auckland");
  return `Daily rate · ${formatSessionDate(wall.iso)}`;
}

/** "Spot · updated 2:20 am NZDT" from gold-api updatedAt. Null when that field is absent. Never says Live. */
export function metalUpdatedPhrase(quotedAt: string | null | undefined): string | null {
  const date = parseQuoteTime(quotedAt ?? null);
  if (!date) return null;
  return `Spot · updated ${formatQuoteClock(date, "Pacific/Auckland")}`;
}

/**
 * Home metals sentence. Same rule as the tape badge: Est. when the quote is
 * not live, otherwise the gold-api clock when one exists.
 */
export function metalsHomeHint(live: boolean, quotedAt?: string | null): string {
  if (!live) return "Est. gold and silver. Not a report.";
  const phrase = metalUpdatedPhrase(quotedAt);
  if (phrase) return `${phrase} gold and silver. Not a report.`;
  return "Spot gold and silver. Not a report.";
}

/** Newest finite vendor timestamp. Fetch time is not a substitute. */
export function latestQuoteTime(values: Array<string | number | Date | null | undefined>): Date | null {
  let best: Date | null = null;
  for (const value of values) {
    const date = parseQuoteTime(value);
    if (!date) continue;
    if (!best || date.getTime() > best.getTime()) best = date;
  }
  return best;
}
