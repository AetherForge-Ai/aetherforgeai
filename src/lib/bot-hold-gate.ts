/**
 * H-12: Stox and Koins Hold gate.
 *
 * A last price older than the limit for that market is not rated. The bot
 * shows Hold, a plain reason, and how old the price is. The words buy and
 * sell are not used.
 *
 * Limits (a price at the limit is still rated; older than the limit is Hold):
 * - NZX shares: 1 trading day. A Friday close is still usable on Monday.
 * - ASX shares: 1 trading day. Same session shape as the NZX.
 * - US shares: 2 trading days. The US close lands later in New Zealand, so
 *   one extra session is allowed before the row is held.
 * - Crypto: 15 minutes. Crypto trades every day, so the clock is wall time.
 */

export const DATA_TOO_OLD_HOLD = "Hold: data too old";

export type HoldAsset = "nzx" | "asx" | "us" | "crypto";

export const HOLD_ASSETS: readonly HoldAsset[] = ["nzx", "asx", "us", "crypto"];

type TradingLimit = { kind: "trading-days"; limit: number; name: string };
type MinuteLimit = { kind: "minutes"; limit: number; name: string };

export const HOLD_LIMITS: Record<HoldAsset, TradingLimit | MinuteLimit> = {
  nzx: { kind: "trading-days", limit: 1, name: "NZX shares" },
  asx: { kind: "trading-days", limit: 1, name: "ASX shares" },
  us: { kind: "trading-days", limit: 2, name: "US shares" },
  crypto: { kind: "minutes", limit: 15, name: "Crypto" },
};

/** Weekdays strictly after `from` up to and including `to` (UTC calendar days). */
function tradingDaysBetween(from: Date, to: Date): number {
  if (!(to > from)) return 0;
  let days = 0;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (cursor.getTime() < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

export function holdAssetForMarket(market: string | null | undefined): HoldAsset {
  const code = String(market || "").trim().toUpperCase();
  if (code === "CRYPTO") return "crypto";
  if (code === "ASX") return "asx";
  if (code === "US" || code === "DOW" || code === "NASDAQ" || code === "NYSE") return "us";
  return "nzx";
}

function limitPhrase(asset: HoldAsset): string {
  const row = HOLD_LIMITS[asset];
  if (row.kind === "minutes") return `${row.limit} minutes`;
  return row.limit === 1 ? "1 trading day" : `${row.limit} trading days`;
}

/** One sentence for /methodology. No result figures. */
export function holdLimitLine(asset: HoldAsset): string {
  const row = HOLD_LIMITS[asset];
  return `${row.name}: older than ${limitPhrase(asset)}.`;
}

function agePhrase(asset: HoldAsset, at: Date, now: Date): string {
  if (HOLD_LIMITS[asset].kind === "trading-days") {
    const days = tradingDaysBetween(at, now);
    return days === 1 ? "1 trading day old" : `${days} trading days old`;
  }
  const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 90) return minutes === 1 ? "1 minute old" : `${minutes} minutes old`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return hours === 1 ? "1 hour old" : `${hours} hours old`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day old" : `${days} days old`;
}

export function staleHoldDecision(
  asset: HoldAsset,
  lastPrintAt: string | Date,
  now = new Date()
): { held: false } | { held: true; text: string } {
  const at = lastPrintAt instanceof Date ? lastPrintAt : new Date(lastPrintAt);
  if (Number.isNaN(at.getTime())) return { held: false };
  const row = HOLD_LIMITS[asset];
  const tooOld =
    row.kind === "trading-days"
      ? tradingDaysBetween(at, now) > row.limit
      : now.getTime() - at.getTime() > row.limit * 60_000;
  if (!tooOld) return { held: false };
  const verb = row.name === "Crypto" ? "stays" : "stay";
  const text = `${DATA_TOO_OLD_HOLD}. The last price is ${agePhrase(asset, at, now)}. ${row.name} ${verb} on Hold when the last price is older than ${limitPhrase(asset)}.`;
  return { held: true, text };
}

/**
 * A print time older than this market's limit, for the test hook.
 * The age is real: the gate measures it, it is not a fake label.
 */
export function forcedStalePrintIso(asset: HoldAsset, now = new Date()): string {
  if (HOLD_LIMITS[asset].kind === "minutes") {
    return new Date(now.getTime() - 60 * 60_000).toISOString();
  }
  const limit = HOLD_LIMITS[asset].kind === "trading-days" ? HOLD_LIMITS[asset].limit : 1;
  let cursor = new Date(now.getTime());
  let guard = 0;
  while (tradingDaysBetween(cursor, now) <= limit && guard < 21) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    guard += 1;
  }
  return cursor.toISOString();
}

export function isStaleHoldText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith(DATA_TOO_OLD_HOLD);
}

export function withStaleHold<
  T extends { score: number; analysisHold?: string | null; reasoning?: string; convictionReason?: string },
>(row: T, lastPrintAt: string | Date | null | undefined, asset: HoldAsset = "nzx", now = new Date()): T {
  if (lastPrintAt == null || lastPrintAt === "") return row;
  const decision = staleHoldDecision(asset, lastPrintAt, now);
  if (!decision.held) return row;
  return {
    ...row,
    score: 0,
    analysisHold: decision.text,
    reasoning: decision.text,
    convictionReason: decision.text,
  };
}

const FACING: Record<string, string> = {
  "STRONG BUY": "Strong positive signal",
  BUY: "Positive signal",
  ACCUMULATE: "Positive signal",
  HOLD: "Hold",
  TRIM: "Weakening signal",
  REDUCE: "Weakening signal",
  SELL: "Negative signal",
  "STRONG SELL": "Strong negative signal",
  WATCH: "Watch",
};

/** The word a member sees in place of a rating. Stale rows say Hold. */
export function botFacingWord(word: string, note?: string | null): string {
  if (isStaleHoldText(note)) return "Hold";
  const key = String(word || "").trim().toUpperCase();
  if (!key) return "Hold";
  return FACING[key] ?? "Model indicator";
}

/** Drop buy and sell from bot sentences. Hold stays. A hyphenated word is left as written. */
export function scrubBotCopy(text: string): string {
  return text.replace(/\b(buy(?:s|ing)?|sell(?:s|ing)?)\b(?!-)/gi, (word) => {
    const phrase = /^sell/i.test(word) ? "negative signal" : "positive signal";
    return word[0] === word[0].toUpperCase() ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : phrase;
  });
}

const UNSCRUBBED_KEYS = new Set([
  "action",
  "signal",
  "ticker",
  "symbol",
  "url",
  "href",
  "bot",
  "currency",
  "id",
  "_id",
  "market",
  "impact",
  "coinId",
]);

/** Member-facing report copy. Rating enums stay so colours still match. */
export function scrubBotReportCopy<T>(value: T, key = ""): T {
  if (typeof value === "string") return (UNSCRUBBED_KEYS.has(key) ? value : scrubBotCopy(value)) as T;
  if (Array.isArray(value)) return value.map((item) => scrubBotReportCopy(item, key)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = scrubBotReportCopy(child, childKey);
    }
    return out as T;
  }
  return value;
}
