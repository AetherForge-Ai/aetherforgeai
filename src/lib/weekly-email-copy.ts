/**
 * Monday projections email: market-wide week-ahead figures, HTML and text.
 * No account book is read here. Sample fixtures belong in tests.
 *
 * pull-check:weekly-email-2026-10-11
 */

import { formatDisplayDate } from "@/lib/currency";
import { equityFreshnessLabel, equityVenue, parseQuoteTime } from "@/lib/market-freshness";
import {
  analyzeSecurity,
  formatMarketPrice,
  resolveExchange,
  type MarketCode,
} from "@/lib/market-intel";
import { formatPercent } from "@/lib/portfolio";
import { CRYPTO_PROJECTIONS_PAUSED, isCryptoProjectionRow, rankByConfidenceWeightedMove } from "@/lib/projection-pause";
import { modelRangeLine } from "@/lib/public-intel";
import { CUSTOMER_EMAIL, ENGINE_PARAGRAPH } from "@/lib/public-copy";
import {
  absoluteAuthUrl,
  escapeHtml,
  prepareOutboundMail,
  type OutboundMail,
} from "@/lib/transactional-mail";

const INPUT_CHAR_CAP = 1500 * 4;
const FROM_NAME = "AetherForge AI";

/** Same cut as the projections page top list. */
export const WEEKLY_EMAIL_LIST_CAP = 50;
const PROJECTION_SERIES_MIN = 40;

export interface WeeklyEmailSeriesInput {
  ticker: string;
  name: string;
  market: MarketCode;
  /** Real daily closes, oldest to newest. A short or missing series is not a projection. */
  series?: number[] | null;
  /** Optional quote used as the last point, the same way the projections page anchors a series. */
  price?: number | null;
  quotedAt?: string | null;
  assetKind?: "stock" | "metal";
}

export interface WeeklyEmailProjection {
  ticker: string;
  name: string;
  marketLabel: string;
  priceLabel: string;
  moveLabel: string;
  confidenceLabel: string;
  asOfLabel: string;
  rangeLabel: string | null;
}

export interface WeeklyEmailBoard {
  asOfLabel: string;
  projections: WeeklyEmailProjection[];
  sourceLine: string;
  cryptoLine: string;
  metalsLine: string;
}

export interface WeeklyEmailRenderInput {
  to: string;
  board: WeeklyEmailBoard;
  aiNote: string | null;
  unsubscribeUrl: string;
}

function positiveCloses(series: number[] | null | undefined): number[] | null {
  if (!series?.length) return null;
  const closes = series.filter((point) => Number.isFinite(point) && point > 0);
  return closes.length >= PROJECTION_SERIES_MIN ? closes : null;
}

/**
 * Rank verified 7-day projections with the same engine and order as the projections page.
 * A row is included only when a real close series of at least 40 points is supplied.
 * Crypto is always left out. Metals are left out: the projections feature does not produce them.
 * Returns null when nothing verified remains, so the caller skips the send.
 */
export function composeWeeklyProjections(input: {
  rows: WeeklyEmailSeriesInput[];
  now: Date;
}): WeeklyEmailBoard | null {
  const built: Array<WeeklyEmailProjection & { projected7dPct: number; confidence: number }> = [];
  for (const row of input.rows) {
    if (row.assetKind === "metal") continue;
    if (isCryptoProjectionRow({ market: row.market, assetClass: row.market === "CRYPTO" ? "crypto" : "stock" })) {
      continue;
    }
    const closes = positiveCloses(row.series);
    if (!closes) continue;
    const ticker = row.ticker.trim();
    if (!ticker) continue;
    try {
      const price = typeof row.price === "number" && row.price > 0 ? row.price : closes[closes.length - 1];
      const intel = analyzeSecurity(ticker, price, row.name, row.market, closes);
      if (isCryptoProjectionRow(intel)) continue;
      if (!Number.isFinite(intel.projected7dPct)) continue;
      const exchange = resolveExchange(intel.ticker, intel.market);
      const quotedAt = parseQuoteTime(row.quotedAt);
      const freshness = equityFreshnessLabel(equityVenue(exchange), input.now, quotedAt);
      const range = modelRangeLine(intel.outlook);
      built.push({
        ticker: intel.ticker,
        name: intel.name,
        marketLabel: exchange === "DOW" ? "Dow Jones" : exchange,
        priceLabel: formatMarketPrice(intel.price, intel.currency),
        moveLabel: formatPercent(intel.projected7dPct),
        confidenceLabel: `${Math.round(intel.confidence)}%`,
        asOfLabel: freshness.label,
        rangeLabel: range,
        projected7dPct: intel.projected7dPct,
        confidence: intel.confidence,
      });
    } catch {
      continue;
    }
  }
  const ranked = rankByConfidenceWeightedMove(built).slice(0, WEEKLY_EMAIL_LIST_CAP);
  if (!ranked.length) return null;
  return {
    asOfLabel: formatDisplayDate(input.now),
    projections: ranked.map(({ projected7dPct: _pct, confidence: _confidence, ...row }) => row),
    sourceLine:
      "Source: daily closes used by the projections page. The 7-day figure is indicative. Not an official, licensed, or real-time quote.",
    cryptoLine: CRYPTO_PROJECTIONS_PAUSED
      ? "Crypto projections are paused, so none are included."
      : "Crypto projections are not included in this email.",
    metalsLine: "Precious-metal projections are not produced by the projections feature, so none are shown.",
  };
}

export function weeklyEmailPrompt(board: WeeklyEmailBoard): string {
  const lines = [
    "Write four short sentences of general information about these market-wide indicative 7-day projections.",
    "Use only the figures below. Do not invent prices, dates, or events.",
    "Do not give an instruction. Do not use rating labels.",
    "Do not name a model or a provider.",
    "Do not refer to any person's holdings, cash, profit or loss, or account.",
    `As of ${board.asOfLabel}`,
    board.sourceLine,
    board.cryptoLine,
    board.metalsLine,
    "Projections:",
  ];
  for (const row of board.projections) {
    lines.push(
      `${row.ticker} | ${row.name} | ${row.marketLabel} | last ${row.priceLabel} | indicative 7-day ${row.moveLabel} | model confidence ${row.confidenceLabel} | ${row.asOfLabel}${row.rangeLabel ? ` | ${row.rangeLabel}` : ""}`,
    );
    if (lines.join("\n").length > INPUT_CHAR_CAP) {
      lines.pop();
      lines.push("Further names are in the email and are not listed here.");
      break;
    }
  }
  const text = lines.join("\n");
  return text.length <= INPUT_CHAR_CAP ? text : text.slice(0, INPUT_CHAR_CAP);
}

const RATING = /\b(strong buy|strong sell|buy|sell|accumulate|reduce)\b/i;
const MODEL_NAME = /\b(grok|xai|openai|anthropic|claude|gemini|gpt-\d|zenith|ultra)\b/i;

/** Drop an AI note that uses a removed rating label or names a model. */
export function scrubWeeklyAiNote(raw: string | null | undefined): string | null {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (RATING.test(text) || MODEL_NAME.test(text)) return null;
  return text.length > 900 ? `${text.slice(0, 900).trim()}…` : text;
}

function paragraphs(lines: string[]): string {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n");
}

function projectionTable(board: WeeklyEmailBoard): string {
  const head = "<tr><th>Name</th><th>Indicative 7-day</th><th>As of</th></tr>";
  const body = board.projections
    .map((row) => {
      const name = `${row.ticker} ${row.name}`;
      const detail = `${row.marketLabel}. Last ${row.priceLabel}. Model confidence ${row.confidenceLabel}.`;
      const extra = row.rangeLabel ? `<br>${escapeHtml(row.rangeLabel)}` : "";
      return `<tr><td>${escapeHtml(name)}<br>${escapeHtml(detail)}${extra}</td><td>${escapeHtml(row.moveLabel)}</td><td>${escapeHtml(row.asOfLabel)}</td></tr>`;
    })
    .join("");
  return `<table>${head}${body}</table>`;
}

export function renderWeeklyEmail(input: WeeklyEmailRenderInput): OutboundMail {
  const board = input.board;
  const ai = scrubWeeklyAiNote(input.aiNote);
  const aiLine = ai
    ? `AI-written note: ${ai}`
    : "No AI-written note was added to this message. Nothing was invented to replace it.";
  const intro =
    "These are the indicative 7-day projections for the week ahead. They are the same kind of figure the projections page ranks. This email does not include the holdings, cash, or profit or loss on your account.";
  const textLines = [
    `AetherForge AI weekly projections — ${board.asOfLabel}`,
    "",
    "Hi,",
    intro,
    board.sourceLine,
    board.cryptoLine,
    board.metalsLine,
    "",
    "The week ahead",
    ...board.projections.flatMap((row) => [
      `${row.ticker} ${row.name} (${row.marketLabel})`,
      `Last ${row.priceLabel}. Indicative 7-day ${row.moveLabel}. Model confidence ${row.confidenceLabel}. ${row.asOfLabel}.`,
      row.rangeLabel || "",
    ]),
    "",
    aiLine,
    "",
    "This is general information. It is not financial advice and it is not an instruction.",
    ENGINE_PARAGRAPH,
    "Turn off this weekly email",
    input.unsubscribeUrl,
  ].filter((line) => line !== "");

  const html = `<style>
  .mail { font-family: Georgia, "Times New Roman", serif; color: #1c1917; line-height: 1.45; max-width: 560px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 4px; vertical-align: top; border-bottom: 1px solid #e7e5e4; }
  a { color: #1d4e89; }
</style>
<div class="mail">
  <h1>The week ahead</h1>
  <p>${escapeHtml(board.asOfLabel)}</p>
  <p>Hi,</p>
  <p>${escapeHtml(intro)}</p>
  <p>${escapeHtml(board.sourceLine)}</p>
  <p>${escapeHtml(board.cryptoLine)}</p>
  <p>${escapeHtml(board.metalsLine)}</p>
  ${projectionTable(board)}
  <h2>AI-written note</h2>
  ${paragraphs([aiLine])}
  <p>This is general information. It is not financial advice and it is not an instruction.</p>
  <p>${escapeHtml(ENGINE_PARAGRAPH)}</p>
  <p><a href="${escapeHtml(input.unsubscribeUrl)}">Turn off this weekly email</a></p>
  <p>${escapeHtml(input.unsubscribeUrl)}</p>
</div>`;

  return prepareOutboundMail({
    to: [input.to],
    subject: `AetherForge AI weekly projections — ${board.asOfLabel}`,
    from: CUSTOMER_EMAIL,
    fromName: FROM_NAME,
    replyTo: CUSTOMER_EMAIL,
    html,
    text: textLines.join("\n"),
  });
}

export function weeklyEmailUnsubscribeHref(token: string): string {
  return absoluteAuthUrl(`/api/weekly-email/unsubscribe?token=${encodeURIComponent(token)}`);
}
