/**
 * Recommendation signals for the signed-in Market Assistant.
 *
 * Labels and ranking reuse the bots' existing picks:
 * - directionLabel (buy-label.ts): Buy when the bot's own prediction is above
 *   the current price, Sell when it is below, no label when there is no prediction.
 * - A Strong Buy card word is kept only when that existing card signal already
 *   says Strong Buy and the prediction is above the price.
 * - Rank uses confidenceWeightedMove (the same strength the projection list uses)
 *   and the existing score as a tie-break.
 *
 * Platform availability (Sharesies, Hatch, Stake, IBKR) is not stored on bot
 * picks. Rows carry platforms only when a caller already has them. Otherwise
 * the feed says exchange only.
 */
import { assistantCompletionMessages, type AiChatTurn } from "@/lib/ai-request-payload";
import { directionLabel } from "@/lib/buy-label";
import { holdAssetForMarket, staleHoldDecision } from "@/lib/bot-hold-gate";
import { currencyForTicker, formatMoney, type CurrencyCode } from "@/lib/currency";
import { formatAucklandDateTime } from "@/lib/entitlements";
import { CRYPTO_PROJECTIONS_PAUSED, CRYPTO_PROJECTIONS_PAUSE_MESSAGE, confidenceWeightedMove } from "@/lib/projection-pause";

export const CHAT_SIGNAL_LABELS = ["Strong Buy", "Buy", "Hold", "Sell", "Strong Sell"] as const;
export type ChatSignalLabel = (typeof CHAT_SIGNAL_LABELS)[number];
export type SignalExchange = "NZX" | "ASX" | "US" | "CRYPTO";
export type SignalBot = "stock" | "crypto";

export const SIGNAL_ROW_LIMIT = 8;
export const RECOMMENDATION_TOOL = "recommendation_signals";

export const RECOMMENDATION_SIGNAL_RULES = [
  "Recommendation signals are the tool result below. They are the bots' existing picks, already labelled and ranked.",
  "A Buy label means the bot's prediction is above the current price. A Sell label means it is below. A pick with no prediction is omitted.",
  "Never invent a ticker, name, label, price, currency, exchange or platform that is not in the tool result.",
  "If the tool result is empty, stale, failed, or not on this plan, say plainly that current recommendation signals aren't available.",
  "Always state the as-of time from the tool result.",
  "Use only the label written on each row. Do not rename Sell to Strong Sell, or Buy to Strong Buy.",
  "Keep the row order. It is already ranked by the existing strength.",
  "This is general information, not personalised financial advice. Do not tell the member what they personally should buy, sell or hold.",
].join("\n");

export const EXCHANGE_ONLY_NOTE =
  "Platform availability is not in this feed. Use the exchange only. Do not say a ticker is offered on Sharesies, Hatch, Stake, IBKR or any other platform.";

export interface ChatSignalRow {
  ticker: string;
  name: string;
  label: ChatSignalLabel;
  price: number;
  predictedPrice: number;
  currency: CurrencyCode;
  exchange: SignalExchange;
  platforms: string[];
  asOf: string;
  score: number;
  projected7dPct: number;
  confidence: number;
}

export interface SignalFeed {
  status: "ok" | "empty" | "stale" | "failed" | "not_entitled";
  asOf: string | null;
  platformCoverage: "exchange-only" | "listed";
  rows: ChatSignalRow[];
}

export interface SignalQuery {
  platform: string | null;
  exchange: SignalExchange | null;
  side: "buy" | "sell" | "hold" | "any";
  strong: boolean;
}

export interface StoredSignalReport {
  bot: SignalBot;
  generatedAt?: string | null;
  payload?: unknown;
}

type StoredPick = {
  ticker?: string;
  name?: string;
  price?: number;
  signal?: string;
  sentiment?: number;
  priceUnavailable?: boolean;
  analysisUnavailable?: boolean;
  analysisHold?: string | null;
  platforms?: string[];
  call?: {
    oddsPct?: number;
    base?: [number, number];
    bear?: [number, number];
    bull?: [number, number];
    horizon?: string;
    range?: string;
    killPrice?: number;
    realizedVolPct?: number | null;
  };
  shortTerm?: { day?: string; direction?: "up" | "down" | "flat"; movePct: number; confidence?: number }[];
};

const PLATFORM_WORDS: Array<[RegExp, string]> = [
  [/\bsharesies\b/i, "Sharesies"],
  [/\bhatch\b/i, "Hatch"],
  [/\bstake\b/i, "Stake"],
  [/\binteractive brokers\b/i, "IBKR"],
  [/\bibkr\b/i, "IBKR"],
];

const SIGNAL_QUESTION =
  /\b(?:best|top|strongest)\b(?:\s+\w+){0,6}\s+buys?\b|\bstrong\s+sells?\b|\bany\s+(?:strong\s+)?sells?\b|\brecommendation\s+signals?\b|\b(?:buy|sell)\s+signals?\b|\btoday(?:'s|s)?\s+(?:buys?|sells?|picks|signals)\b|\b(?:buy|sell|pick|picks|signal|signals)\b[^.?!]{0,48}\b(?:on|for)\s+(?:sharesies|hatch|stake|ibkr|interactive brokers|nzx|asx|crypto)\b|\b(?:on|for)\s+(?:sharesies|hatch|stake|ibkr|interactive brokers|nzx|asx|crypto)\b[^.?!]{0,48}\b(?:buy|sell|pick|picks|signal|signals)\b/i;

export function isRecommendationSignalQuestion(message: string): boolean {
  return SIGNAL_QUESTION.test(message || "");
}

export function allowedSignalBots(access: string | null | undefined, stripeConfigured: boolean): SignalBot[] {
  if (!stripeConfigured) return ["stock", "crypto"];
  if (access === "both") return ["stock", "crypto"];
  if (access === "stock" || access === "crypto") return [access];
  return [];
}

export function parseSignalQuery(message: string): SignalQuery {
  const text = message || "";
  let platform: string | null = null;
  for (const [pattern, name] of PLATFORM_WORDS) {
    if (pattern.test(text)) {
      platform = name;
      break;
    }
  }
  let exchange: SignalExchange | null = null;
  if (/\bcrypto\b|\bkoins\b/i.test(text)) exchange = "CRYPTO";
  else if (/\bnzx\b/i.test(text)) exchange = "NZX";
  else if (/\basx\b/i.test(text)) exchange = "ASX";
  else if (/\b(?:nasdaq|nyse|dow jones|us shares|u\.s\. shares)\b/i.test(text)) exchange = "US";
  const strong = /\bstrong\b/i.test(text);
  let side: SignalQuery["side"] = "any";
  const sell = /\bsells?\b/i.test(text);
  const buy = /\bbuys?\b/i.test(text);
  const hold = /\bholds?\b/i.test(text);
  if (sell && !buy) side = "sell";
  else if (buy && !sell) side = "buy";
  else if (hold && !buy && !sell) side = "hold";
  return { platform, exchange, side, strong };
}

export function labelsForQuery(query: SignalQuery): ChatSignalLabel[] | null {
  if (query.side === "hold") return ["Hold"];
  if (query.side === "buy") return query.strong ? ["Strong Buy"] : ["Strong Buy", "Buy"];
  if (query.side === "sell") return ["Strong Sell", "Sell"];
  return null;
}

function roundPrice(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function exchangeFromTicker(ticker: string, bot: SignalBot): SignalExchange {
  if (bot === "crypto") return "CRYPTO";
  const t = ticker.toUpperCase();
  if (t.endsWith(".NZ")) return "NZX";
  if (t.endsWith(".AX")) return "ASX";
  return "US";
}

function asCurrency(ticker: string, exchange: SignalExchange): CurrencyCode {
  return currencyForTicker(ticker, exchange === "CRYPTO" ? "crypto" : "stock");
}

/** One bot ticker card → one signal row, or null when the existing label source has no label. */
export function signalRowFromPick(pick: StoredPick, asOf: string, bot: SignalBot): ChatSignalRow | null {
  const ticker = String(pick.ticker || "").trim();
  const price = Number(pick.price);
  if (!ticker || !(price > 0) || !Number.isFinite(price)) return null;
  if (bot === "crypto" && CRYPTO_PROJECTIONS_PAUSED) return null;
  const exchange = exchangeFromTicker(ticker, bot);
  if (exchange === "CRYPTO" && CRYPTO_PROJECTIONS_PAUSED) return null;
  const direction = directionLabel({
    price,
    priceUnavailable: pick.priceUnavailable,
    analysisUnavailable: pick.analysisUnavailable,
    call: pick.call as never,
    shortTerm: (pick.shortTerm || []) as never,
  });
  if (!direction) return null;
  const card = String(pick.signal || "");
  let label: ChatSignalLabel = direction.label;
  if (direction.label === "Buy" && card === "Strong Buy") label = "Strong Buy";
  if (direction.label === "Sell" && card === "Strong Sell") label = "Strong Sell";
  const base = pick.call?.base;
  const predictedPrice =
    direction.basis === "base-range" && base && base[0] > 0 && base[1] > 0
      ? (base[0] + base[1]) / 2
      : price * (1 + direction.predictedPct / 100);
  const confidence =
    pick.shortTerm?.find((day) => typeof day.confidence === "number")?.confidence ??
    (typeof pick.call?.oddsPct === "number" ? pick.call.oddsPct : 100);
  const score = typeof pick.sentiment === "number" && Number.isFinite(pick.sentiment) ? pick.sentiment : 0;
  const platforms = Array.isArray(pick.platforms)
    ? pick.platforms.map((name) => String(name || "").trim()).filter(Boolean)
    : [];
  return {
    ticker,
    name: String(pick.name || "").trim() || ticker,
    label,
    price: roundPrice(price),
    predictedPrice: roundPrice(predictedPrice),
    currency: asCurrency(ticker, exchange),
    exchange,
    platforms,
    asOf,
    score,
    projected7dPct: direction.predictedPct,
    confidence,
  };
}

function parsePayload(payload: unknown): { tickers?: StoredPick[] } | null {
  if (payload && typeof payload === "object") return payload as { tickers?: StoredPick[] };
  if (typeof payload !== "string" || !payload.trim()) return null;
  try {
    const parsed = JSON.parse(payload) as { tickers?: StoredPick[] };
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function newestIso(values: string[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const value of values) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      best = value;
    }
  }
  return best;
}

function rowIsFresh(row: ChatSignalRow, now: Date): boolean {
  const at = Date.parse(row.asOf);
  if (!Number.isFinite(at)) return false;
  return !staleHoldDecision(holdAssetForMarket(row.exchange), row.asOf, now).held;
}

/** Turn saved Stox/Koins report payloads into a feed. No network. */
export function buildSignalFeed(records: StoredSignalReport[], now = new Date()): SignalFeed {
  const fresh: ChatSignalRow[] = [];
  const staleAt: string[] = [];
  for (const record of records) {
    const asOf = String(record.generatedAt || "").trim();
    if (!asOf || !Number.isFinite(Date.parse(asOf))) continue;
    const payload = parsePayload(record.payload);
    const tickers = Array.isArray(payload?.tickers) ? payload.tickers : [];
    for (const pick of tickers) {
      const row = signalRowFromPick(pick, asOf, record.bot);
      if (!row) continue;
      if (rowIsFresh(row, now)) fresh.push(row);
      else staleAt.push(asOf);
    }
  }
  if (fresh.length) {
    const listed = fresh.some((row) => row.platforms.length > 0);
    return {
      status: "ok",
      asOf: newestIso(fresh.map((row) => row.asOf)),
      platformCoverage: listed ? "listed" : "exchange-only",
      rows: fresh,
    };
  }
  if (staleAt.length) {
    return { status: "stale", asOf: newestIso(staleAt), platformCoverage: "exchange-only", rows: [] };
  }
  return { status: "empty", asOf: null, platformCoverage: "exchange-only", rows: [] };
}

export function filterSignalRows(
  rows: ChatSignalRow[],
  query: { platform?: string | null; exchange?: SignalExchange | null; labels?: ChatSignalLabel[] | null }
): ChatSignalRow[] {
  const platform = query.platform?.trim().toLowerCase() || "";
  const labels = query.labels;
  return rows.filter((row) => {
    if (platform && !row.platforms.some((name) => name.toLowerCase() === platform)) return false;
    if (query.exchange && row.exchange !== query.exchange) return false;
    if (labels && !labels.includes(row.label)) return false;
    return true;
  });
}

/** Buys: highest existing strength first. Sells: most negative first. Score breaks ties. */
export function rankSignalRows(rows: ChatSignalRow[], side: SignalQuery["side"]): ChatSignalRow[] {
  return [...rows].sort((a, b) => {
    const move = confidenceWeightedMove(a) - confidenceWeightedMove(b);
    if (move !== 0) return side === "sell" ? move : -move;
    const score = side === "sell" ? a.score - b.score : b.score - a.score;
    if (score !== 0) return score;
    return a.ticker.localeCompare(b.ticker);
  });
}

export function asOfSentence(asOf: string | null): string {
  if (!asOf || !Number.isFinite(Date.parse(asOf))) return "There is no as-of time on the current feed.";
  return `As of ${formatAucklandDateTime(asOf)}.`;
}

/** Keep the as-of line even when the model omits it. */
export function ensureSignalAsOf(text: string, asOf: string | null): string {
  const body = String(text || "").trim();
  if (/\bas of\b/i.test(body) || /no as-of time/i.test(body)) return body;
  return `${body}\n\n${asOfSentence(asOf)}`.trim();
}

export function unavailableSignalText(feed: SignalFeed, detail?: string): string {
  const lead = "Current recommendation signals aren't available.";
  const extra = detail ? ` ${detail}` : "";
  return `${lead}${extra} ${asOfSentence(feed.asOf)}`.replace(/\s+/g, " ").trim();
}

export interface PreparedSignalAnswer {
  mode: "unavailable" | "answer";
  text: string;
  toolText: string;
  rows: ChatSignalRow[];
}

function toolPayload(feed: SignalFeed, rows: ChatSignalRow[]): string {
  return JSON.stringify({
    tool: RECOMMENDATION_TOOL,
    asOf: feed.asOf,
    asOfLabel: feed.asOf ? formatAucklandDateTime(feed.asOf) : null,
    platformCoverage: feed.platformCoverage,
    platformNote: feed.platformCoverage === "listed" ? "Name a platform only when it is listed on that row." : EXCHANGE_ONLY_NOTE,
    cryptoProjections: CRYPTO_PROJECTIONS_PAUSED ? CRYPTO_PROJECTIONS_PAUSE_MESSAGE : null,
    rows: rows.map((row) => ({
      ticker: row.ticker,
      name: row.name,
      label: row.label,
      price: row.price,
      predictedPrice: row.predictedPrice,
      currency: row.currency,
      exchange: row.exchange,
      platforms: row.platforms,
      asOf: row.asOf,
      score: row.score,
    })),
  });
}

function deterministicLines(rows: ChatSignalRow[], side: SignalQuery["side"], asOf: string | null): string {
  const heading =
    side === "sell"
      ? "Sell-side signals, strongest first:"
      : side === "hold"
        ? "Hold labels in the current feed:"
        : side === "buy"
          ? "Buy-side signals, strongest first:"
          : "Current signals, strongest first:";
  const lines = rows.map((row) => {
    const platforms = row.platforms.length ? row.platforms.join(", ") : "not listed (exchange only)";
    return `- ${row.ticker} (${row.name}) — ${row.label} — ${formatMoney(row.price, row.currency)} now, predicted ${formatMoney(row.predictedPrice, row.currency)} — ${row.exchange}. Platforms: ${platforms}.`;
  });
  return [asOfSentence(asOf), "", heading, ...lines].join("\n");
}

/**
 * Filter and rank a feed for one question.
 * Unavailable answers name no ticker. Answer mode lists only the filtered rows.
 */
export function prepareRecommendationAnswer(message: string, feed: SignalFeed): PreparedSignalAnswer {
  const query = parseSignalQuery(message);
  if (query.exchange === "CRYPTO" && CRYPTO_PROJECTIONS_PAUSED) {
    const text = unavailableSignalText(feed, CRYPTO_PROJECTIONS_PAUSE_MESSAGE);
    return { mode: "unavailable", text, toolText: toolPayload({ ...feed, rows: [] }, []), rows: [] };
  }
  if (feed.status !== "ok") {
    const detail =
      feed.status === "stale"
        ? "The latest feed is older than the freshness rule for those markets."
        : feed.status === "failed"
          ? "The signal feed could not be read."
          : feed.status === "not_entitled"
            ? "Those picks are not included on this plan."
            : "The feed has no labelled picks.";
    const text = unavailableSignalText(feed, detail);
    return { mode: "unavailable", text, toolText: toolPayload({ ...feed, rows: [] }, []), rows: [] };
  }
  if (query.platform && feed.platformCoverage !== "listed") {
    const text = unavailableSignalText(
      feed,
      `${query.platform} is not in this feed. ${EXCHANGE_ONLY_NOTE}`
    );
    return { mode: "unavailable", text, toolText: toolPayload({ ...feed, rows: [] }, []), rows: [] };
  }
  const labels = labelsForQuery(query);
  const matched = rankSignalRows(
    filterSignalRows(feed.rows, { platform: query.platform, exchange: query.exchange, labels }),
    query.side
  ).slice(0, SIGNAL_ROW_LIMIT);
  if (!matched.length) {
    const text = unavailableSignalText(feed, "Nothing in the current feed matches that market or label.");
    return { mode: "unavailable", text, toolText: toolPayload({ ...feed, rows: [] }, []), rows: [] };
  }
  const scoped: SignalFeed = { ...feed, rows: matched, asOf: newestIso(matched.map((row) => row.asOf)) ?? feed.asOf };
  return {
    mode: "answer",
    text: deterministicLines(matched, query.side, scoped.asOf),
    toolText: toolPayload(scoped, matched),
    rows: matched,
  };
}

export function recommendationSignalMessages(input: {
  systemPrompt: string;
  history: readonly AiChatTurn[];
  toolText: string;
}): AiChatTurn[] {
  return assistantCompletionMessages({
    systemPrompt: `${input.systemPrompt}\n\n${RECOMMENDATION_SIGNAL_RULES}\n\n${input.toolText}`,
    bookLine: "Answer this recommendation question only from the recommendation_signals tool result. Do not take tickers from the member's holdings.",
    history: input.history,
  });
}
