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
} from "@/lib/broker-sync/ibkr-flex";

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
  if (!res.ok) throw new Error(`IBKR answered HTTP ${res.status}${res.status === 403 ? " (refused the request; this is not a token error)" : ""}. Try again later.`);
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

/** Writes trades through the H-10 import path and dividends/cash through applyTransaction. */
export async function applyFlexStatement(user: SyncUser, statement: string): Promise<Omit<SyncResult, "ok" | "message">> {
  let trades = 0;
  let duplicates = 0;
  const looksXml = statement.trimStart().startsWith("<");
  const csv = looksXml ? flexTradesCsv(statement) : statement;
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
  let cash = 0;
  if (looksXml) {
    const rows = flexCashRows(statement);
    const seen = rows.length ? await knownRefs(user._id) : new Set<string>();
    for (const row of rows) {
      if (seen.has(row.id)) {
        duplicates += 1;
        continue;
      }
      const fx = row.currency.toUpperCase() === "NZD" ? 1 : row.fxRateToBase;
      if (fx == null) continue; // no rate: not guessed, left for a file import
      const nzd = Math.round(row.amount * fx * 100) / 100;
      const note = `Synced from IBKR Flex. ref=${row.id}`;
      const input =
        row.kind === "dividend"
          ? { type: "dividend", ticker: row.symbol.toUpperCase(), asset_type: "stock", amount: nzd, dividend_gross: row.amount, fx_rate: fx, fx_source: "IBKR FXRateToBase", executed_at: row.date, trade_date: row.date, notes: note, idempotency_key: row.id }
          : { type: row.kind, amount: nzd, executed_at: row.date, trade_date: row.date, notes: note, idempotency_key: row.id };
      await applyTransaction(user, input as never);
      seen.add(row.id);
      cash += 1;
    }
  }
  invalidateBookCache(user._id);
  return { trades, cash, duplicates };
}

/** One sync for one stored connection. Errors are stored as a plain message, never the token. */
export async function syncConnection(user: SyncUser, conn: StoredConnection): Promise<SyncResult> {
  try {
    const token = await decryptToken(conn.enc_token, user._id);
    const statement = await fetchFlexStatement(token, conn.query_id);
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
