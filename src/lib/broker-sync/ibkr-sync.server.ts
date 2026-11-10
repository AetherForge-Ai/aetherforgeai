import "server-only";
import { applyTransaction } from "@/lib/transactions";
import { totalumSdk } from "@/lib/totalum";
import { invalidateBookCache } from "@/lib/book-cache";
import { runH10Import } from "@/lib/import/persist";
import { decryptToken } from "@/lib/broker-sync/token-crypto.server";
import { markSync, type StoredConnection } from "@/lib/broker-sync/connection-store.server";
import {
  IBKR_USER_AGENT,
  flexCashRows,
  flexTradesCsv,
  getStatementUrl,
  parseFlexResponse,
  sendRequestUrl,
  statementPending,
  type FlexCashRow,
} from "@/lib/broker-sync/ibkr-flex";
import { isSandboxConnection } from "@/lib/broker-sync/ibkr-sandbox";
import { IBKR_FLEX_FIXTURE } from "@/lib/broker-sync/ibkr-flex-fixture";
import { testHooksAllowedFor } from "@/lib/test-hooks";

type SyncUser = Parameters<typeof applyTransaction>[0];

export interface SyncResult {
  ok: boolean;
  trades: number;
  cash: number;
  duplicates: number;
  message: string;
}

/** IBKR allows 1 request/s and 10/min per token; we wait 2 s between status polls, at most 5 polls. */
const POLL_WAIT_MS = 2_000;
const POLL_TRIES = 5;

async function flexGet(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": IBKR_USER_AGENT, accept: "application/xml,text/xml,text/csv" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const body = await res.text();
  // b32 BS-01: IBKR reports token problems as XML ErrorCode (1012 expired, 1015 invalid), even on a
  // non-200. Hand that to the parser; a bare HTTP 403 with no ErrorCode is not a token error.
  if (!res.ok && /<ErrorCode>\s*\d+\s*<\/ErrorCode>/.test(body)) return body;
  if (!res.ok) throw new Error(`IBKR answered HTTP ${res.status}${res.status === 403 ? ": IBKR refused the request. Check your Flex token and Query ID in Client Portal → Flex Web Service, then try again" : ". Try again later"}.`);
  return body;
}

/**
 * Connect-time check: one SendRequest. A token IBKR rejects (expired, IP-restricted, invalid)
 * is refused before anything is saved. The reference it returns is not used.
 */
export async function verifyFlexCredentials(token: string, queryId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const answer = parseFlexResponse(await flexGet(sendRequestUrl(token, queryId)));
    return answer.ok === false ? { ok: false, message: answer.message } : { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "IBKR could not be reached. Nothing was saved." };
  }
}

/** Fetch the statement for a token + query. The token is used only in the request URL and never logged. */
export async function fetchFlexStatement(token: string, queryId: string, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<string> {
  const first = parseFlexResponse(await flexGet(sendRequestUrl(token, queryId)));
  if (first.ok === false) throw Object.assign(new Error(first.message), { flexCode: first.code });
  for (let i = 0; i < POLL_TRIES; i += 1) {
    await wait(POLL_WAIT_MS);
    const body = await flexGet(getStatementUrl(token, first.reference));
    const pending = statementPending(body);
    if (!pending) return body;
    if (pending.ok === false && !pending.retry) throw Object.assign(new Error(pending.message), { flexCode: pending.code });
  }
  throw new Error("IBKR is still generating the statement. Try Sync now again in a minute.");
}

function refOf(notes: unknown): string {
  return /(?:^|\s)ref=(\S+)/.exec(String(notes || ""))?.[1] || "";
}

async function knownRefs(userId: string): Promise<Set<string>> {
  const res = await totalumSdk.crud.query("transaction", { _filter: { user: userId }, _limit: 5000 });
  return new Set(((res?.data as unknown as Array<{ notes?: string }>) || []).map((r) => refOf(r.notes)).filter(Boolean));
}

/** Statement deposits and withdrawals, then dividends. A missing rate is not guessed. */
async function bookFlexCash(user: SyncUser, rows: readonly FlexCashRow[], seen: Set<string>, written: string[]): Promise<{ cash: number; duplicates: number }> {
  let cash = 0;
  let duplicates = 0;
  for (const row of rows) {
    if (seen.has(row.id)) {
      duplicates += 1;
      continue;
    }
    const fx = row.currency.toUpperCase() === "NZD" ? 1 : row.fxRateToBase;
    if (fx == null) continue;
    const nzd = Math.round(row.amount * fx * 100) / 100;
    const note = `Synced from IBKR Flex. ref=${row.id}`;
    const input =
      row.kind === "dividend"
        ? { type: "dividend", ticker: row.symbol.toUpperCase(), asset_type: "stock", amount: nzd, dividend_gross: row.amount, fx_rate: fx, fx_source: "IBKR FXRateToBase", executed_at: row.date, trade_date: row.date, notes: note }
        : { type: row.kind, amount: nzd, executed_at: row.date, trade_date: row.date, notes: note };
    const saved = (await applyTransaction(user, input as never)) as { ledgerId?: string; transaction?: { _id?: string }; cashBalance?: number; pendingCash?: number };
    const id = saved.ledgerId || saved.transaction?._id || "";
    if (id) written.push(id);
    const nextCash = saved.pendingCash ?? saved.cashBalance;
    if (typeof nextCash === "number" && Number.isFinite(nextCash)) {
      const session = user as { cash_balance?: number; cash_read_at?: number };
      session.cash_balance = nextCash;
      session.cash_read_at = Date.now();
    }
    seen.add(row.id);
    cash += 1;
  }
  return { cash, duplicates };
}

async function storedCash(user: SyncUser): Promise<number> {
  const read = totalumSdk.crud.getRecordById;
  if (typeof read === "function") {
    try {
      const res = await read("user", user._id);
      const cash = Number((res as { data?: { cash_balance?: number } } | undefined)?.data?.cash_balance);
      if (Number.isFinite(cash)) return cash;
    } catch {
      /* The session figure is the fallback when this read is not on the client. */
    }
  }
  return typeof user.cash_balance === "number" ? user.cash_balance : 0;
}

/** Drop statement cash rows from a failed trade commit and put the balance back. Refs go with the rows. */
async function unwindFlexCash(user: SyncUser, ids: readonly string[], cashBefore: number): Promise<void> {
  for (const id of [...ids].reverse()) {
    if (!id) continue;
    await totalumSdk.crud.deleteRecordById("transaction", id).catch(() => undefined);
  }
  await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: cashBefore });
  const session = user as { cash_balance?: number; cash_read_at?: number };
  session.cash_balance = cashBefore;
  delete session.cash_read_at;
}

/** Writes trades through the H-10 import path and dividends/cash through applyTransaction. */
export async function applyFlexStatement(user: SyncUser, statement: string): Promise<Omit<SyncResult, "ok" | "message">> {
  const looksXml = statement.trimStart().startsWith("<");
  if (!looksXml) {
    throw new Error("IBKR Flex sync only accepts a Flex XML statement. Nothing was written.");
  }
  let trades = 0;
  let duplicates = 0;
  const csv = flexTradesCsv(statement);
  const rows = flexCashRows(statement);
  const seen = rows.length ? await knownRefs(user._id) : new Set<string>();
  const cashBefore = await storedCash(user);
  const fundingIds: string[] = [];
  // The statement's own cash is booked before the buys, so a short book is not topped up with paper cash.
  const funding = await bookFlexCash(user, rows.filter((row) => row.kind !== "dividend"), seen, fundingIds);
  let cash = funding.cash;
  duplicates += funding.duplicates;
  try {
    if (csv.split("\n").length > 1) {
      const res = await runH10Import(user, csv, { engine: "h10", action: "commit" }, "broker-sync");
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; data?: { written?: number; duplicates?: number[] }; error?: string };
      if (body.ok) {
        trades = body.data?.written ?? 0;
        duplicates += body.data?.duplicates?.length ?? 0;
      } else if (res.status !== 409) {
        throw new Error(body.error || "The trades in the IBKR statement could not be saved.");
      }
    }
  } catch (err) {
    await unwindFlexCash(user, fundingIds, cashBefore);
    throw err;
  }
  // Dividends need the holding the trades just saved.
  const dividends = await bookFlexCash(user, rows.filter((row) => row.kind === "dividend"), seen, []);
  cash += dividends.cash;
  duplicates += dividends.duplicates;
  invalidateBookCache(user._id);
  return { trades, cash, duplicates };
}

/** One sync for one stored connection. Errors are stored as a plain message, never the token. */
export async function syncConnection(user: SyncUser, conn: StoredConnection): Promise<SyncResult> {
  try {
    let statement: string;
    if (isSandboxConnection(conn)) {
      // b64 BS-01: sandbox connections use the bundled fixture, and only for allow-listed test accounts.
      if (!testHooksAllowedFor(user as { _id?: string })) throw new Error("This sandbox connection is not available. Disconnect and connect a real IBKR token.");
      statement = IBKR_FLEX_FIXTURE;
    } else {
      const token = await decryptToken(conn.enc_token, user._id);
      statement = await fetchFlexStatement(token, conn.query_id);
    }
    const out = await applyFlexStatement(user, statement);
    await markSync(conn._id, "active", null);
    const message = `Synced: ${out.trades} trade${out.trades === 1 ? "" : "s"}, ${out.cash} dividend or cash line${out.cash === 1 ? "" : "s"}, ${out.duplicates} already in your book.`;
    return { ok: true, ...out, message };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The sync failed.";
    const expired = (err as { flexCode?: string }).flexCode === "1012";
    await markSync(conn._id, expired ? "expired" : "error", message).catch(() => undefined);
    console.warn(`[broker-sync] ibkr sync failed for a member: ${(err as { flexCode?: string }).flexCode || "error"}`);
    return { ok: false, trades: 0, cash: 0, duplicates: 0, message };
  }
}
