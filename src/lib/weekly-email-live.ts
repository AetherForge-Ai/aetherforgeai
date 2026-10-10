/**
 * Live reads for the Monday paper-book email.
 * Mail leaves this file only through deliverWeeklyEmail, and only when the flag is on.
 *
 * pull-check:weekly-email-2026-10-11
 */

import "server-only";
import { getFxSnapshot } from "@/lib/fx";
import { createGrokChatCompletion, isGrokConfigured } from "@/lib/grok";
import { reportEmailWasDelivered } from "@/lib/report-email";
import { loadStockRowsForAccount } from "@/lib/report-service";
import { sendTransactionalEmail } from "@/lib/send-transactional-mail";
import { totalumSdk } from "@/lib/totalum";
import { isBullionHolding } from "@/lib/metal-valuation";
import type { Stock } from "@/lib/portfolio";
import { CUSTOMER_EMAIL } from "@/lib/public-copy";
import { yahooEquitySymbol, fetchYahooHistories } from "@/lib/yahoo-finance";
import {
  WEEKLY_EMAIL_FROM,
  WEEKLY_EMAIL_FROM_NAME,
  WEEKLY_EMAIL_LEDGER_TICKER,
  WEEKLY_EMAIL_OUTPUT_TOKEN_CAP,
  WEEKLY_EMAIL_SCAN_LIMIT,
  applyWeeklyEmailOptOut,
  decodeWeeklyEmailPreference,
  encodeWeeklyEmailPreference,
  weeklyEmailSendingEnabled,
  type WeeklyEmailCandidate,
  type WeeklyEmailStore,
} from "@/lib/weekly-email";
import type { WeeklyEmailBook } from "@/lib/weekly-email-copy";
import type { OutboundMail } from "@/lib/transactional-mail";

const SERIES_CAP = 8;
const SERIES_TIMEOUT_MS = 8_000;

const AI_SYSTEM = [
  "You are AI writing a short general-information note about a paper book.",
  "Use only the figures in the user message. Do not invent prices, dates, or events.",
  "Do not give an instruction. Do not use the words buy, sell, hold, accumulate, or reduce.",
  "Do not name a model or a provider. If asked what you are, say only that you are AI.",
  "Four short sentences.",
].join(" ");

function ownerId(row: { user?: unknown }): string {
  const user = row.user;
  if (typeof user === "string") return user;
  if (user && typeof user === "object") {
    const record = user as { _id?: unknown; id?: unknown };
    return String(record._id || record.id || "");
  }
  return "";
}

export function candidateFromUserRow(row: Record<string, unknown>): WeeklyEmailCandidate {
  return {
    id: String(row._id || row.id || ""),
    email: typeof row.email === "string" ? row.email : "",
    emailVerified: row.email_verified ?? row.emailVerified,
    name: typeof row.name === "string" ? row.name : null,
    subscriptionStatus: typeof row.subscription_status === "string" ? row.subscription_status : null,
    subscriptionPlan: typeof row.subscription_plan === "string" ? row.subscription_plan : null,
    subscriptionExpiresAt:
      typeof row.subscription_expires_at === "string" ? row.subscription_expires_at : null,
    cashNzd: typeof row.cash_balance === "number" ? row.cash_balance : 0,
  };
}

export async function loadWeeklyEmailCandidates(): Promise<WeeklyEmailCandidate[]> {
  const res = await totalumSdk.crud.query("user", {
    _filter: { subscription_status: "active" },
    _limit: WEEKLY_EMAIL_SCAN_LIMIT,
  });
  const rows = ((res as { data?: Record<string, unknown>[] })?.data || []) as Record<string, unknown>[];
  return rows.map(candidateFromUserRow).filter((row) => row.id);
}

export async function loadWeeklyEmailUser(userId: string): Promise<WeeklyEmailCandidate | null> {
  const res = await totalumSdk.crud.getRecordById("user", userId);
  const row = (res as { data?: Record<string, unknown> })?.data;
  if (!row) return null;
  const candidate = candidateFromUserRow(row);
  return candidate.id ? candidate : null;
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadStockSeries(stocks: Stock[]): Promise<Record<string, number[]>> {
  const equities = stocks.filter((stock) => stock.asset_type !== "crypto" && !isBullionHolding(stock.asset_type, stock.ticker, stock.company_name));
  const map: Record<string, string> = {};
  for (const stock of equities.slice(0, SERIES_CAP)) {
    map[stock.ticker] = yahooEquitySymbol(stock.ticker);
  }
  if (!Object.keys(map).length) return {};
  try {
    const series = await withTimeout(fetchYahooHistories(map), SERIES_TIMEOUT_MS);
    return series || {};
  } catch {
    console.error("[weekly-email] close series unavailable");
    return {};
  }
}

export async function loadWeeklyEmailBook(user: WeeklyEmailCandidate & { cashNzd?: number }): Promise<WeeklyEmailBook> {
  const loaded = await loadStockRowsForAccount(user.id);
  if (!loaded.bookLoaded) {
    return { loaded: false, stocks: [], cashNzd: 0, fx: { NZD: 1, USD: 1.67, AUD: 1.09 }, series: {} };
  }
  const stocks: Stock[] = [];
  for (const row of loaded.rows) {
    const ticker = String(row.ticker || "").trim().toUpperCase();
    const shares = Number(row.shares) || 0;
    if (!ticker || ticker === WEEKLY_EMAIL_LEDGER_TICKER || !(shares > 0)) continue;
    const asset = isBullionHolding(row.asset_type, ticker, row.company_name)
      ? "metal"
      : row.asset_type === "crypto"
        ? "crypto"
        : "stock";
    const purchase = Number(row.purchase_price) || 0;
    const current = Number(row.current_price) > 0 ? Number(row.current_price) : purchase;
    stocks.push({
      _id: String(row._id || ticker),
      ticker,
      asset_type: asset,
      company_name: typeof row.company_name === "string" ? row.company_name : ticker,
      sector: typeof row.sector === "string" ? row.sector : undefined,
      shares,
      purchase_price: purchase,
      current_price: current,
      purchase_date: typeof row.purchase_date === "string" ? row.purchase_date : null,
    });
  }
  let fx = { NZD: 1, USD: 1.67, AUD: 1.09 };
  let fxSourced = false;
  try {
    const snapshot = await getFxSnapshot();
    fx = snapshot.ratesToNZD;
    fxSourced = snapshot.sourced;
  } catch {
    fxSourced = false;
  }
  const series = await loadStockSeries(stocks);
  const cash = typeof user.cashNzd === "number" ? user.cashNzd : 0;
  return { loaded: true, stocks, cashNzd: cash, fx, series, fxSourced };
}

async function findLedger(userId: string): Promise<{ id: string; name: string } | null> {
  const res = await totalumSdk.crud.query("watchlist", {
    _filter: { user: userId, ticker: WEEKLY_EMAIL_LEDGER_TICKER },
    _limit: 5,
  });
  const rows = ((res as { data?: { _id?: string; name?: string; ticker?: string; user?: unknown }[] })?.data || []);
  const row = rows.find((item) => {
    if (String(item.ticker || "").toUpperCase() !== WEEKLY_EMAIL_LEDGER_TICKER) return false;
    const owner = ownerId(item);
    return !owner || owner === userId;
  });
  if (!row?._id) return null;
  return { id: String(row._id), name: typeof row.name === "string" ? row.name : "" };
}

export const liveWeeklyEmailStore: WeeklyEmailStore = {
  async read(userId) {
    const row = await findLedger(userId);
    if (!row) return { ok: true, preference: { optedOut: false, lastIsoWeek: null } };
    const preference = decodeWeeklyEmailPreference(row.name);
    if (!preference) return { ok: false, reason: "unreadable" };
    return { ok: true, preference };
  },
  async write(userId, preference) {
    const name = encodeWeeklyEmailPreference(preference);
    const existing = await findLedger(userId);
    if (existing) {
      await totalumSdk.crud.editRecordById("watchlist", existing.id, { name });
      return;
    }
    await totalumSdk.crud.createRecord("watchlist", {
      ticker: WEEKLY_EMAIL_LEDGER_TICKER,
      name,
      asset_type: "stock",
      market: "US",
      user: userId,
    });
  },
};

export async function optOutWeeklyEmail(userId: string): Promise<void> {
  await applyWeeklyEmailOptOut(liveWeeklyEmailStore, userId);
}

/**
 * The same sender verification mail uses.
 * Refuses unless WEEKLY_EMAIL_SEND is exactly "on".
 * `from` is checked and is not posted: EmailPayloadI does not include it.
 * The text part is kept on the message object and is not posted either.
 */
export async function deliverWeeklyEmail(mail: OutboundMail): Promise<void> {
  if (!weeklyEmailSendingEnabled(process.env)) {
    throw new Error("Weekly email sender is off.");
  }
  if (mail.from !== WEEKLY_EMAIL_FROM || mail.replyTo !== WEEKLY_EMAIL_FROM) {
    throw new Error("Weekly email from address is not the admin mailbox.");
  }
  const result = await sendTransactionalEmail({
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    fromName: mail.fromName || WEEKLY_EMAIL_FROM_NAME,
    replyTo: mail.replyTo || CUSTOMER_EMAIL,
  });
  if (!reportEmailWasDelivered(result)) {
    throw new Error("Weekly email was not accepted by the mail sender.");
  }
}

export async function completeWeeklyEmailNote(prompt: string): Promise<string | null> {
  if (!isGrokConfigured()) return null;
  return createGrokChatCompletion({
    messages: [
      { role: "system", content: AI_SYSTEM },
      { role: "user", content: prompt },
    ],
    maxTokens: WEEKLY_EMAIL_OUTPUT_TOKEN_CAP,
    temperature: 0.2,
  });
}
