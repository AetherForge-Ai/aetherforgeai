import { formatDisplayDateTime } from "@/lib/currency";
import { FEED_FRESHNESS_WINDOWS } from "@/lib/feed-freshness-hook";
import { TICKER_TAPE } from "@/lib/ticker-feed";

/** A provider timestamp older than this is shown as unavailable. Not an uptime claim. */
export const STATUS_STALE_MS = 7 * 24 * 60 * 60 * 1000;

/** NZ daylight time runs from the last Sunday in September to the first Sunday in April. */
export function nzZoneAbbr(date: Date): "NZDT" | "NZST" {
  const offset = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  return offset === "GMT+13:00" ? "NZDT" : "NZST";
}

/** M-2: a /status time in NZ time with the zone, e.g. "22 Oct 2026, 9:18 am NZDT". */
export function formatStatusTime(input?: string | Date | null): string {
  const base = formatDisplayDateTime(input);
  if (base === "—" || input == null || input === "") return "—";
  return `${base} ${nzZoneAbbr(input instanceof Date ? input : new Date(input))}`;
}

/** M-2 P2: the equity row from a saved quote time, in the same format as the other rows. */
export function statusSavedLabel(at: string, now = Date.now()): string {
  void now;
  return `${formatStatusTime(at)} · saved quote time`;
}

export interface StatusFeedRow {
  label: string;
  tone: "ok" | "amber" | "red";
  text: string;
}

/** Words for an age threshold: "15 minutes", "1 hour", "4 days". */
export function freshnessWindowWords(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 120) return `${minutes} minutes`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.round(ms / 86_400_000);
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * Freshness cell from a provider time and a failure flag.
 * A usable print past the amber window is amber. Past the red window, or a
 * failure with no usable print, is red. A missing time that is not a confirmed
 * failure stays amber ("unavailable") — this page does not invent an outage.
 */
export function shapeStatusFeed(input: {
  label: string;
  at: string | null | undefined;
  now?: number;
  amberMs: number;
  redMs: number;
  failed?: boolean;
  failedText?: string;
}): StatusFeedRow {
  const now = input.now ?? Date.now();
  const parsed = input.at ? Date.parse(input.at) : NaN;
  const age = Number.isFinite(parsed) ? now - parsed : null;
  const usable = age != null && age >= -60_000 && age <= STATUS_STALE_MS;
  const stamp = usable ? formatStatusTime(input.at) : "";

  if (input.failed && usable && age! <= input.redMs) {
    const why = (input.failedText || "last refresh failed").replace(/^—\s*/, "");
    return { label: input.label, tone: "amber", text: `${stamp} · previous print kept; ${why}` };
  }
  if (input.failed) {
    return { label: input.label, tone: "red", text: input.failedText || "unavailable" };
  }
  if (!usable) {
    return {
      label: input.label,
      tone: age != null && age > STATUS_STALE_MS ? "red" : "amber",
      text: "unavailable",
    };
  }
  if (age! > input.redMs) {
    return {
      label: input.label,
      tone: "red",
      text: `${stamp} · older than ${freshnessWindowWords(input.redMs)}`,
    };
  }
  if (age! > input.amberMs) {
    return {
      label: input.label,
      tone: "amber",
      text: `${stamp} · older than ${freshnessWindowWords(input.amberMs)}`,
    };
  }
  return { label: input.label, tone: "ok", text: stamp === "—" ? "unavailable" : stamp };
}

/** Status-page sentence. A healthy feed still says "Last OK". A stale or failed feed does not. */
export function statusFeedBody(feed: StatusFeedRow): string {
  if (feed.text.startsWith("—") || feed.text === "unavailable") return feed.text;
  if (feed.label === "Crypto list last attempt") return `Last attempt ${feed.text}`;
  if (feed.tone === "ok" || feed.text.endsWith("· saved quote time")) return `Last OK ${feed.text}`;
  return `Last print ${feed.text}`;
}

/**
 * Last provider time for a public feed. Missing, unparseable, or stale times
 * are "unavailable". The fetch clock is never substituted.
 * pull-check:batch1-2026-10-11 B1-7
 */
export function presentStatusFeed(
  label: string,
  at: string | null | undefined,
  now = Date.now()
): StatusFeedRow {
  const parsed = at ? Date.parse(at) : NaN;
  const fresh = Number.isFinite(parsed) && parsed <= now + 60_000 && now - parsed <= STATUS_STALE_MS;
  if (!fresh) return { label, tone: "amber", text: "unavailable" };
  return { label, tone: "ok", text: formatDisplayDateTime(at) };
}

export function latestIso(values: Array<string | null | undefined>): string | null {
  let best = Number.NEGATIVE_INFINITY;
  let iso: string | null = null;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isFinite(time) && time > best) {
      best = time;
      iso = value;
    }
  }
  return iso;
}


/**
 * b34 M-2 (Chief ruling): honest label for the saved equity snapshot time — never implies live.
 * "Prices last updated 6:32 am NZDT" today, "Prices last updated 6:32 am NZDT, 13 Oct" otherwise (NZST in winter).
 */
export function savedSnapshotLabel(at: string, now = Date.now()): string {
  const d = new Date(at);
  const tz = "Pacific/Auckland";
  const time = new Intl.DateTimeFormat("en-NZ", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d).replace(/\s+/g, " ").toLowerCase();
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const sameDay = day(d) === day(new Date(now));
  const date = new Intl.DateTimeFormat("en-NZ", { timeZone: tz, day: "numeric", month: "short" }).format(d);
  // b58 P3 (TT): the real zone label for that moment, NZDT in summer and NZST in winter (was a fixed "NZT").
  const zone =
    new Intl.DateTimeFormat("en-NZ", { timeZone: tz, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value || "NZ time";
  return `Prices last updated ${time} ${zone}${sameDay ? "" : `, ${date}`}`;
}

/** b62 TT P2: /status DEX row label. */
export const DEX_STATUS_LABEL = "DEX tokens";
/** b62 TT P2: DEX list age bands (same as crypto quotes). */
export const DEX_STATUS_WINDOW = { amberMs: 15 * 60 * 1000, redMs: 60 * 60 * 1000 };

/** M-2-STATUS: a feed with no provider stamp. Never "undefined" and never blank. */
export const NO_SAVED_TIME_YET = "— no saved time yet";

export interface CryptoCoinStamp {
  symbol?: string | null;
  price?: number | null;
  quotedAt?: string | null;
}

export interface EquityQuoteStamp {
  symbol?: string | null;
  quotedAt?: string | null;
  price?: number | null;
  changePct?: number | null;
}

export interface StatusTickerSources {
  /** Coins on the snapshot the ticker turns into tape rows. */
  cryptoCoins?: CryptoCoinStamp[] | null;
  /** Snapshot `at`. Used only when a served coin has no quotedAt of its own. */
  cryptoSnapshotAt?: string | null;
  /** Equity quotes the ticker handler serves (tape / last-good). */
  equityQuotes?: EquityQuoteStamp[] | null;
  /** Saved NZX/ASX prints. Used only when the ticker has no quote time for that venue. */
  savedEquityQuotes?: EquityQuoteStamp[] | null;
  dexAt?: string | null;
  fxFetchedAt?: string | null;
  fxAsOf?: string | null;
  metalsQuotedAt?: string | null;
  metalsAsOf?: string | null;
  aiCheckedAt?: string | null;
}

export interface StatusLastOkLine {
  label: string;
  /** ISO stamp this line was built from. Null when the feed has no stamp. */
  at: string | null;
  row: StatusFeedRow;
  body: string;
}

export type StatusLastOkKind = "freshness" | "saved" | "probe";

function usableIso(at: string | null | undefined): string | null {
  if (typeof at !== "string" || !at.trim() || !Number.isFinite(Date.parse(at))) return null;
  return at;
}

/**
 * M-2-STATUS: the quote time GET /api/ticker puts on a crypto row.
 * quotesFromCoins uses `coin.quotedAt || snapshot.at`, not the snapshot stamp alone.
 * The newest of those times is the feed's last good print.
 */
export function cryptoQuotedAtServedByTicker(
  coins: CryptoCoinStamp[] | null | undefined,
  snapshotAt: string | null | undefined,
): string | null {
  const wanted = new Set(TICKER_TAPE.crypto.map((row) => row.symbol.toUpperCase()));
  const times: Array<string | null | undefined> = [];
  for (const coin of coins ?? []) {
    const symbol = (coin.symbol || "").trim().toUpperCase();
    if (!wanted.has(symbol) || !(typeof coin.price === "number" && coin.price > 0)) continue;
    times.push(coin.quotedAt || snapshotAt || null);
  }
  return latestIso(times);
}

/** Newest quotedAt for one venue. A ticker row has a finite change; a stored print may not. */
export function newestVenueQuotedAt(
  quotes: EquityQuoteStamp[] | null | undefined,
  venue: "NZX" | "ASX",
): string | null {
  const suffix = venue === "NZX" ? ".NZ" : ".AX";
  const venueQuotes = (quotes ?? []).filter((quote) => (quote.symbol || "").trim().toUpperCase().endsWith(suffix));
  const served = venueQuotes.filter(
    (quote) =>
      typeof quote.changePct === "number" &&
      Number.isFinite(quote.changePct) &&
      (quote.price == null || (typeof quote.price === "number" && quote.price > 0)),
  );
  const pool = served.length
    ? served
    : venueQuotes.filter((quote) => quote.price == null || (typeof quote.price === "number" && quote.price > 0));
  return latestIso(pool.map((quote) => quote.quotedAt));
}

/** Ticker quote time when the handler has one; otherwise the stored share-price time. */
export function venueLastOkAt(
  tickerQuotes: EquityQuoteStamp[] | null | undefined,
  savedQuotes: EquityQuoteStamp[] | null | undefined,
  venue: "NZX" | "ASX",
): string | null {
  return newestVenueQuotedAt(tickerQuotes, venue) ?? newestVenueQuotedAt(savedQuotes, venue);
}

function noSavedLine(label: string): StatusLastOkLine {
  const row: StatusFeedRow = { label, tone: "amber", text: NO_SAVED_TIME_YET };
  return { label, at: null, row, body: statusFeedBody(row) };
}

/** One /status Last OK line in NZ time, or "no saved time yet" when the stamp is missing. */
export function statusLastOkLine(
  label: string,
  at: string | null | undefined,
  now = Date.now(),
  kind: StatusLastOkKind = "freshness",
  window: { amberMs: number; redMs: number } = FEED_FRESHNESS_WINDOWS.crypto,
): StatusLastOkLine {
  const stamp = usableIso(at);
  if (!stamp) return noSavedLine(label);
  if (kind === "saved") {
    const row: StatusFeedRow = { label, tone: "amber", text: statusSavedLabel(stamp, now) };
    return { label, at: stamp, row, body: statusFeedBody(row) };
  }
  if (kind === "probe") {
    const text = formatStatusTime(stamp);
    if (text === "—") return noSavedLine(label);
    const row: StatusFeedRow = { label, tone: "ok", text };
    return { label, at: stamp, row, body: statusFeedBody(row) };
  }
  const row = shapeStatusFeed({ label, at: stamp, now, amberMs: window.amberMs, redMs: window.redMs });
  if (row.text === "unavailable") return noSavedLine(label);
  return { label, at: stamp, row, body: statusFeedBody(row) };
}

/**
 * M-2-STATUS: Last OK lines for the feeds /status lists.
 * Crypto uses the ticker's quotedAt, not a separate older snapshot stamp.
 */
export function buildStatusLastOk(sources: StatusTickerSources, now = Date.now()): StatusLastOkLine[] {
  const fxAt = usableIso(sources.fxFetchedAt) ?? usableIso(sources.fxAsOf);
  const metalsAt = usableIso(sources.metalsQuotedAt) ?? usableIso(sources.metalsAsOf);
  return [
    statusLastOkLine("NZX shares", venueLastOkAt(sources.equityQuotes, sources.savedEquityQuotes, "NZX"), now, "saved"),
    statusLastOkLine("ASX shares", venueLastOkAt(sources.equityQuotes, sources.savedEquityQuotes, "ASX"), now, "saved"),
    statusLastOkLine(
      "Crypto quotes",
      cryptoQuotedAtServedByTicker(sources.cryptoCoins, sources.cryptoSnapshotAt),
      now,
      "freshness",
      FEED_FRESHNESS_WINDOWS.crypto,
    ),
    statusLastOkLine("DEX tokens", sources.dexAt, now, "freshness", DEX_STATUS_WINDOW),
    statusLastOkLine("Exchange rates", fxAt, now, "freshness", FEED_FRESHNESS_WINDOWS.fx),
    statusLastOkLine("Metals spot", metalsAt, now, "freshness", FEED_FRESHNESS_WINDOWS.metals),
    statusLastOkLine("AI guide", sources.aiCheckedAt, now, "probe"),
  ];
}

/** A missing provider time reads as "no saved time yet" on /status. */
export function withNoSavedTime(row: StatusFeedRow): StatusFeedRow {
  if (row.text === "unavailable") return { ...row, tone: "amber", text: NO_SAVED_TIME_YET };
  return row;
}

/**
 * b62 TT P2: the DEX row. "Last OK" is the saved DEX list's own time; a refresh that failed
 * after that time is named with its time and reason (this server's last attempt).
 */
export function dexStatusRow(
  at: string | null | undefined,
  failure: { at: string; reason: string } | null | undefined,
  now = Date.now(),
  sourceNote?: string | null
): StatusFeedRow {
  const shaped = shapeStatusFeed({ label: DEX_STATUS_LABEL, at, now, ...DEX_STATUS_WINDOW });
  // b64 TT P2: when one source came back empty and the other carried the list, say which and why.
  const note = (sourceNote || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const row = note ? { ...shaped, text: `${shaped.text} · ${note}` } : shaped;
  if (failure && (!at || Date.parse(failure.at) > Date.parse(at))) {
    const reason = failure.reason.replace(/\s+/g, " ").trim().slice(0, 160);
    return {
      ...row,
      tone: row.tone === "ok" ? "amber" : row.tone,
      text: `${row.text} · last refresh failed ${formatStatusTime(failure.at)}: ${reason}`,
    };
  }
  return row;
}
