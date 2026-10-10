/**
 * Live reads for the Monday projections email.
 * Mail leaves this file only through deliverWeeklyEmail, and only when the flag is on.
 * No account book is loaded. One market-wide board is shared by every recipient.
 *
 * pull-check:weekly-email-2026-10-11
 */

import "server-only";
import { createGrokChatCompletion, isGrokConfigured } from "@/lib/grok";
import {
  fetchHistoriesForAssetClass,
  fetchQuotesForAssetClass,
  isLiveConfiguredFor,
} from "@/lib/market-data";
import { universeFor } from "@/lib/market-intel";
import { reportEmailWasDelivered } from "@/lib/report-email";
import { sendTransactionalEmail } from "@/lib/send-transactional-mail";
import { totalumSdk } from "@/lib/totalum";
import { CUSTOMER_EMAIL } from "@/lib/public-copy";
import { composeWeeklyProjections, type WeeklyEmailBoard, type WeeklyEmailSeriesInput } from "@/lib/weekly-email-copy";
import {
  WEEKLY_EMAIL_FROM,
  WEEKLY_EMAIL_FROM_NAME,
  WEEKLY_EMAIL_LEDGER_TICKER,
  WEEKLY_EMAIL_NOTE_TICKER,
  WEEKLY_EMAIL_OUTPUT_TOKEN_CAP,
  WEEKLY_EMAIL_SCAN_LIMIT,
  applyWeeklyEmailOptOut,
  decodeWeeklyEmailNote,
  decodeWeeklyEmailPreference,
  encodeWeeklyEmailNote,
  encodeWeeklyEmailPreference,
  weeklyEmailSendingEnabled,
  type WeeklyEmailCandidate,
  type WeeklyEmailNoteStore,
  type WeeklyEmailStore,
} from "@/lib/weekly-email";
import type { OutboundMail } from "@/lib/transactional-mail";

const AI_SYSTEM = [
  "You are AI writing a short general-information note about market-wide indicative projections.",
  "Use only the figures in the user message. Do not invent prices, dates, or events.",
  "Do not give an instruction. Do not use the words buy, sell, hold, accumulate, or reduce.",
  "Do not name a model or a provider. If asked what you are, say only that you are AI.",
  "Do not refer to any person's holdings, cash, profit or loss, or account.",
  "Four short sentences.",
].join(" ");

const memoryNotes = new Map<string, string>();

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

/**
 * The projections page's equity universe, limited to names with a real close series.
 * Crypto histories are not requested. Metals have no projection series in that feature.
 */
export async function loadWeeklyEmailBoard(now = new Date()): Promise<WeeklyEmailBoard | null> {
  const entries = universeFor("stock");
  const tickers = entries.map((entry) => entry.ticker);
  let histories: Record<string, number[]> = {};
  let quotes: Record<string, { price?: number; quotedAt?: string }> = {};
  if (isLiveConfiguredFor("stock") && tickers.length) {
    const [quoteResult, historyResult] = await Promise.all([
      fetchQuotesForAssetClass(tickers, "stock").catch(() => {
        console.error("[weekly-email] equity quotes unavailable");
        return {} as Awaited<ReturnType<typeof fetchQuotesForAssetClass>>;
      }),
      fetchHistoriesForAssetClass(tickers, "stock").catch(() => {
        console.error("[weekly-email] close series unavailable");
        return {} as Record<string, number[]>;
      }),
    ]);
    quotes = quoteResult;
    histories = historyResult;
  }
  const rows: WeeklyEmailSeriesInput[] = [];
  for (const entry of entries) {
    const series = histories[entry.ticker] || histories[entry.ticker.toUpperCase()];
    if (!series?.length) continue;
    const quote = quotes[entry.ticker] || quotes[entry.ticker.toUpperCase()];
    rows.push({
      ticker: entry.ticker,
      name: entry.name,
      market: entry.market,
      series,
      price: typeof quote?.price === "number" ? quote.price : null,
      quotedAt: quote?.quotedAt ?? null,
      assetKind: "stock",
    });
  }
  return composeWeeklyProjections({ rows, now });
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

async function findWeekNote(): Promise<{ id: string; name: string } | null> {
  const res = await totalumSdk.crud.query("watchlist", {
    _filter: { ticker: WEEKLY_EMAIL_NOTE_TICKER },
    _limit: 5,
  });
  const rows = ((res as { data?: { _id?: string; name?: string; ticker?: string }[] })?.data || []);
  const row = rows.find((item) => String(item.ticker || "").toUpperCase() === WEEKLY_EMAIL_NOTE_TICKER);
  if (!row?._id) return null;
  return { id: String(row._id), name: typeof row.name === "string" ? row.name : "" };
}

/** One scrubbed note per ISO week, reused by later ticks in this process and from the stored row. */
export const liveWeeklyEmailNoteStore: WeeklyEmailNoteStore = {
  async read(isoWeek) {
    const cached = memoryNotes.get(isoWeek);
    if (cached) return cached;
    const row = await findWeekNote();
    const note = decodeWeeklyEmailNote(row?.name, isoWeek);
    if (note) memoryNotes.set(isoWeek, note);
    return note;
  },
  async write(isoWeek, note) {
    const text = note.replace(/\s+/g, " ").trim();
    memoryNotes.set(isoWeek, text);
    const name = encodeWeeklyEmailNote(isoWeek, text);
    const existing = await findWeekNote();
    if (existing) {
      await totalumSdk.crud.editRecordById("watchlist", existing.id, { name });
      return;
    }
    await totalumSdk.crud.createRecord("watchlist", {
      ticker: WEEKLY_EMAIL_NOTE_TICKER,
      name,
      asset_type: "stock",
      market: "US",
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
  if (!weeklyEmailSendingEnabled({ WEEKLY_EMAIL_SEND: process.env.WEEKLY_EMAIL_SEND })) {
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
