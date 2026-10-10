/**
 * Paper-book weekly email: figures, ideas, week ahead, HTML and text.
 * Sample fixtures belong in tests. This module does not send mail.
 *
 * pull-check:weekly-email-2026-10-11
 */

import {
  BASELINE_FX_TO_NZD,
  formatDisplayDate,
  formatFxInput,
  formatNzd,
  formatQuantity,
  formatSignedMoney,
  nzdAtBookRate,
  roundMoney,
  type FxRatesToNZD,
} from "@/lib/currency";
import { isBullionHolding } from "@/lib/metal-valuation";
import { analyzeSecurity, type MarketCode } from "@/lib/market-intel";
import { computeSummary, formatPercent, type Stock } from "@/lib/portfolio";
import { CRYPTO_PROJECTIONS_PAUSED } from "@/lib/projection-pause";
import { CUSTOMER_EMAIL, ENGINE_PARAGRAPH } from "@/lib/public-copy";
import {
  absoluteAuthUrl,
  escapeHtml,
  prepareOutboundMail,
  type OutboundMail,
} from "@/lib/transactional-mail";

const INPUT_CHAR_CAP = 1500 * 4;
const FROM_NAME = "AetherForge AI";

export const WEEKLY_EMAIL_LIST_CAP = 25;
const PROJECTION_SERIES_MIN = 40;

export interface WeeklyEmailBook {
  loaded: boolean;
  stocks: Stock[];
  cashNzd: number;
  fx: FxRatesToNZD;
  /** Real daily closes, oldest to newest. Only equities, and only when a feed returned them. */
  series: Record<string, number[]>;
  fxSourced?: boolean;
}

export interface WeeklyEmailRow {
  ticker: string;
  name: string;
  assetType: "stock" | "crypto" | "metal";
  sharesLabel: string;
  valueNzd: number;
  gainNzd: number;
  weightPct: number;
}

export interface WeeklyEmailFacts {
  greetingName: string | null;
  asOfLabel: string;
  cashNzd: number;
  holdingsValueNzd: number;
  costNzd: number;
  gainNzd: number;
  bookNzd: number;
  fxUsd: string;
  fxAud: string;
  fxNote: string;
  rows: WeeklyEmailRow[];
  hiddenCount: number;
  sectors: { sector: string; weightPct: number }[];
  ideas: string[];
  weekAhead: string[];
}

export interface WeeklyEmailDraft {
  facts: WeeklyEmailFacts;
  prompt: string;
}

export interface WeeklyEmailRenderInput {
  to: string;
  facts: WeeklyEmailFacts;
  aiNote: string | null;
  unsubscribeUrl: string;
}

function assetTypeOf(stock: Stock): "stock" | "crypto" | "metal" {
  if (isBullionHolding(stock.asset_type, stock.ticker, stock.company_name)) return "metal";
  if (stock.asset_type === "crypto") return "crypto";
  return "stock";
}

function marketFor(ticker: string): MarketCode {
  if (ticker.endsWith(".NZ")) return "NZX";
  if (ticker.endsWith(".AX")) return "ASX";
  return "US";
}

function weightLabel(pct: number): string {
  if (!Number.isFinite(pct)) return "0.0%";
  return `${pct.toFixed(1)}%`;
}

function openStocks(stocks: Stock[]): Stock[] {
  return stocks.filter((stock) => Number(stock.shares) > 0 && stock.ticker.trim());
}

export function composeWeeklyEmail(book: WeeklyEmailBook): WeeklyEmailDraft | null {
  const stocks = openStocks(book.stocks);
  if (!book.loaded || stocks.length === 0) return null;
  const fx = book.fx || BASELINE_FX_TO_NZD;
  const summary = computeSummary(stocks, { baseCurrency: "NZD", fxToNZD: fx });
  const cashNzd = roundMoney(Math.max(0, Number(book.cashNzd) || 0));
  const holdingsValueNzd = summary.totalValue;
  const bookNzd = roundMoney(holdingsValueNzd + cashNzd);
  const rowsAll: WeeklyEmailRow[] = summary.holdings
    .map((holding) => {
      const valueNzd = roundMoney(holding.baseValue);
      const costNzd = roundMoney(nzdAtBookRate(holding.costBasis, holding.currency, fx));
      return {
        ticker: holding.ticker,
        name: (holding.company_name || holding.ticker).trim(),
        assetType: assetTypeOf(holding),
        sharesLabel: formatQuantity(holding.shares),
        valueNzd,
        gainNzd: roundMoney(valueNzd - costNzd),
        weightPct: bookNzd > 0 ? (valueNzd / bookNzd) * 100 : 0,
      };
    })
    .sort((a, b) => b.valueNzd - a.valueNzd);
  const rows = rowsAll.slice(0, WEEKLY_EMAIL_LIST_CAP);
  const cashWeight = bookNzd > 0 ? (cashNzd / bookNzd) * 100 : 0;
  const facts: WeeklyEmailFacts = {
    greetingName: null,
    asOfLabel: "",
    cashNzd,
    holdingsValueNzd,
    costNzd: summary.totalCost,
    gainNzd: summary.totalGain,
    bookNzd,
    fxUsd: formatFxInput(fx.USD) || "1.6700",
    fxAud: formatFxInput(fx.AUD) || "1.0900",
    fxNote: book.fxSourced
      ? "Daily book rate. Not an official, licensed, or real-time quote."
      : "Baseline book rate. Not an official, licensed, or real-time quote.",
    rows,
    hiddenCount: Math.max(0, rowsAll.length - rows.length),
    sectors: summary.sectorAllocation.map((sector) => ({
      sector: sector.sector,
      weightPct: holdingsValueNzd > 0 ? (sector.value / holdingsValueNzd) * 100 : 0,
    })),
    ideas: ideasFor(rowsAll, cashWeight),
    weekAhead: weekAhead(rowsAll, book.series || {}),
  };
  return { facts, prompt: weeklyEmailPrompt(facts) };
}

export function withWeeklyEmailHeading(facts: WeeklyEmailFacts, name: string | null, asOf: Date): WeeklyEmailFacts {
  const who = (name || "").replace(/\s+/g, " ").trim();
  return { ...facts, greetingName: who || null, asOfLabel: formatDisplayDate(asOf) };
}

function ideasFor(rows: WeeklyEmailRow[], cashWeight: number): string[] {
  const ideas: string[] = [];
  const top = rows[0];
  if (top && top.weightPct >= 40) {
    ideas.push(
      `${top.name} (${top.ticker}) is ${weightLabel(top.weightPct)} of this paper book, including cash. An idea to consider is whether that weight is the mix you meant to record, because one large weight drives most of the book's move.`,
    );
  }
  if (cashWeight >= 40) {
    ideas.push(
      `Cash is ${weightLabel(cashWeight)} of this paper book. An idea to consider is whether that cash is an intentional reserve, because cash does not move with the holdings.`,
    );
  }
  if (rows.length >= 8) {
    ideas.push(
      `This book has ${rows.length} open holdings. An idea to consider is reading the largest weights first, because a long list can still be concentrated in a few names.`,
    );
  }
  if (!ideas.length) {
    ideas.push(
      "An idea to consider is comparing these weights with the mix you meant to record. The table describes this paper book. It is not an instruction.",
    );
  }
  return ideas.slice(0, 3);
}

function projectionLine(row: WeeklyEmailRow, series: number[] | undefined): string {
  if (row.assetType === "crypto") return "";
  if (row.assetType === "metal") return "";
  if (!series || series.filter((point) => point > 0).length < PROJECTION_SERIES_MIN) {
    return `${row.ticker}: no verified 7-day stock projection is included. The existing projection needs a real close series, and none was available.`;
  }
  try {
    const closes = series.filter((point) => point > 0);
    const intel = analyzeSecurity(row.ticker, closes[closes.length - 1], row.name, marketFor(row.ticker), closes);
    if (!Number.isFinite(intel.projected7dPct)) {
      return `${row.ticker}: the existing stock projection did not return a figure, so none is shown.`;
    }
    return `${row.ticker}: illustrative 7-day move from the existing rules-based stock projection is ${formatPercent(intel.projected7dPct)}. This is an illustration from stored closes, not a promise.`;
  } catch {
    return `${row.ticker}: the existing stock projection could not be read, so none is shown.`;
  }
}

function weekAhead(rows: WeeklyEmailRow[], series: Record<string, number[]>): string[] {
  const lines = [
    "No verified ex-dividend date is stored for these holdings. None was invented.",
    "No verified earnings date is stored for these holdings. None was invented.",
  ];
  if (rows.some((row) => row.assetType === "crypto")) {
    lines.push(
      CRYPTO_PROJECTIONS_PAUSED
        ? "Crypto projections are paused. Crypto holdings are listed above and are not given a projection."
        : "Crypto holdings are listed above.",
    );
  }
  if (rows.some((row) => row.assetType === "metal")) {
    lines.push("Metals are listed at their stored values. No verified schedule is on file for them.");
  }
  const stocks = rows.filter((row) => row.assetType === "stock").slice(0, 8);
  for (const row of stocks) lines.push(projectionLine(row, series[row.ticker] || series[row.ticker.toUpperCase()]));
  if (rows.filter((row) => row.assetType === "stock").length > stocks.length) {
    lines.push("Further share holdings are in the table. A projection is omitted when a verified close series is not available.");
  }
  return lines.filter(Boolean);
}

export function weeklyEmailPrompt(facts: WeeklyEmailFacts): string {
  const lines = [
    "Write four short sentences of general information about this paper book.",
    "Use only the figures below. Do not invent prices, dates, events, or holdings.",
    "Do not give an instruction. Do not use rating labels.",
    "Do not name a model or a provider.",
    `Holding count: ${facts.rows.length + facts.hiddenCount}`,
    `Total market value in NZ$: ${formatNzd(facts.holdingsValueNzd)}`,
    `Total cost in NZ$: ${formatNzd(facts.costNzd)}`,
    `Profit or loss in NZ$: ${formatSignedMoney(facts.gainNzd)}`,
    `Cash balance in NZ$: ${formatNzd(facts.cashNzd)}`,
    "Allocation weights:",
    ...facts.rows.map(
      (row) =>
        `${row.ticker} | ${row.name} | weight ${weightLabel(row.weightPct)} | value ${formatNzd(row.valueNzd)} | profit or loss ${formatSignedMoney(row.gainNzd)}`,
    ),
    `Cash weight ${weightLabel(facts.bookNzd > 0 ? (facts.cashNzd / facts.bookNzd) * 100 : 0)}`,
  ];
  if (facts.hiddenCount > 0) {
    lines.push(`${facts.hiddenCount} further holdings are included in the totals and are not listed here.`);
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

function table(facts: WeeklyEmailFacts): string {
  const head = "<tr><th>Holding</th><th>Value</th><th>P/L</th><th>Weight</th></tr>";
  const body = facts.rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.ticker)} ${escapeHtml(row.name)}<br>${escapeHtml(row.sharesLabel)}</td><td>${escapeHtml(formatNzd(row.valueNzd))}</td><td>${escapeHtml(formatSignedMoney(row.gainNzd))}</td><td>${escapeHtml(weightLabel(row.weightPct))}</td></tr>`,
    )
    .join("");
  const cash = `<tr><td>Cash</td><td>${escapeHtml(formatNzd(facts.cashNzd))}</td><td>—</td><td>${escapeHtml(weightLabel(facts.bookNzd > 0 ? (facts.cashNzd / facts.bookNzd) * 100 : 0))}</td></tr>`;
  return `<table>${head}${body}${cash}</table>`;
}

export function renderWeeklyEmail(input: WeeklyEmailRenderInput): OutboundMail {
  const facts = input.facts;
  const hello = facts.greetingName ? `Hi ${facts.greetingName},` : "Hi,";
  const ai = scrubWeeklyAiNote(input.aiNote);
  const aiLine = ai
    ? `AI-written note: ${ai}`
    : "No AI-written note was added to this message. Nothing was invented to replace it.";
  const hidden =
    facts.hiddenCount > 0
      ? `${facts.hiddenCount} further open holdings are included in the totals and are not listed in the table.`
      : "";
  const sectors = facts.sectors.length
    ? `Sector share of holdings value, cash not included: ${facts.sectors
        .map((sector) => `${sector.sector} ${weightLabel(sector.weightPct)}`)
        .join(", ")}.`
    : "";
  const textLines = [
    `AetherForge AI weekly paper book — ${facts.asOfLabel}`,
    "",
    hello,
    "This is a description of the paper book on your account. Stored prices are the latest figures on the book.",
    "",
    `Holdings value ${formatNzd(facts.holdingsValueNzd)}`,
    `Cost ${formatNzd(facts.costNzd)}`,
    `Profit or loss ${formatSignedMoney(facts.gainNzd)}`,
    `Cash ${formatNzd(facts.cashNzd)}`,
    `Book, holdings plus cash ${formatNzd(facts.bookNzd)}`,
    `1 USD = ${facts.fxUsd} NZD. 1 AUD = ${facts.fxAud} NZD. ${facts.fxNote}`,
    "",
    "Holdings",
    ...facts.rows.map(
      (row) =>
        `${row.ticker} ${row.name} ${row.sharesLabel} ${formatNzd(row.valueNzd)} ${formatSignedMoney(row.gainNzd)} ${weightLabel(row.weightPct)}`,
    ),
    `Cash ${formatNzd(facts.cashNzd)} ${weightLabel(facts.bookNzd > 0 ? (facts.cashNzd / facts.bookNzd) * 100 : 0)}`,
    hidden,
    sectors,
    "",
    aiLine,
    "",
    "Ideas to consider",
    ...facts.ideas,
    "",
    "The week ahead",
    ...facts.weekAhead,
    "",
    "This is general information about a paper book. It is not financial advice and it is not an instruction.",
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
  <h1>Weekly paper book</h1>
  <p>${escapeHtml(facts.asOfLabel)}</p>
  <p>${escapeHtml(hello)}</p>
  <p>This is a description of the paper book on your account. Stored prices are the latest figures on the book.</p>
  <p>Holdings value ${escapeHtml(formatNzd(facts.holdingsValueNzd))}. Cost ${escapeHtml(formatNzd(facts.costNzd))}. Profit or loss ${escapeHtml(formatSignedMoney(facts.gainNzd))}. Cash ${escapeHtml(formatNzd(facts.cashNzd))}.</p>
  <p>1 USD = ${escapeHtml(facts.fxUsd)} NZD. 1 AUD = ${escapeHtml(facts.fxAud)} NZD. ${escapeHtml(facts.fxNote)}</p>
  <h2>Holdings</h2>
  ${table(facts)}
  ${hidden ? `<p>${escapeHtml(hidden)}</p>` : ""}
  ${sectors ? `<p>${escapeHtml(sectors)}</p>` : ""}
  <h2>AI-written note</h2>
  ${paragraphs([aiLine])}
  <h2>Ideas to consider</h2>
  ${paragraphs(facts.ideas)}
  <h2>The week ahead</h2>
  ${paragraphs(facts.weekAhead)}
  <p>This is general information about a paper book. It is not financial advice and it is not an instruction.</p>
  <p>${escapeHtml(ENGINE_PARAGRAPH)}</p>
  <p><a href="${escapeHtml(input.unsubscribeUrl)}">Turn off this weekly email</a></p>
  <p>${escapeHtml(input.unsubscribeUrl)}</p>
</div>`;

  return prepareOutboundMail({
    to: [input.to],
    subject: `AetherForge AI weekly paper book — ${facts.asOfLabel}`,
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
