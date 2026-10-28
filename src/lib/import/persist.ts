/**
 * Save an H-10 preview onto the existing paper book.
 * Rows go to the transaction table the ledger already uses. The file hash and
 * the batch id are stamps in the notes field (file= and batch=). No new table.
 */

import { currentCashNzd, planImportUndo } from "@/lib/import-undo-server";
import { NextResponse } from "next/server";
import { checkTickerQuota } from "@/lib/entitlements";
import { historicalNzdPerUnit } from "@/lib/fx";
import { assetClassForSymbol } from "@/lib/import-symbols";
import {
  IMPORT_DUPLICATE_FILE,
  notesHaveBatch,
  notesHaveFile,
  stampFileHash,
  stampImportNote,
  undoImportInOrder,
} from "@/lib/import-commit";
import { batchIdForHash, contentHash } from "@/lib/import/hash";
import { IMPORT_TOO_LARGE, textTooLarge } from "@/lib/import/limits";
import { previewImport } from "@/lib/import/plan";
import { suggestedColumnMap, mappingReady } from "@/lib/import/formats";
import type { ColumnMap, ImportPreview, ImportRow } from "@/lib/import/types";
import { invalidateBookCache } from "@/lib/book-cache";
import { planOrApplyLedgerReversal } from "@/lib/ledger-reversal-apply";
import { applyTransaction } from "@/lib/transactions";
import { totalumSdk } from "@/lib/totalum";
import { formatNzd } from "@/lib/currency";
import { lotCivilDay } from "@/lib/executed-at";
import { takeRateLimit } from "@/lib/ip-rate-limit";

/** b31 H-10: commits and undos per member per 10 minutes. Preview is not counted. */
export const IMPORT_WRITE_LIMIT = 20;
export const IMPORT_WRITE_WINDOW_MS = 10 * 60 * 1000;

/** b31 H-10: strip a leading formula character from text taken from a file (CSV injection). */
export function safeImportText(value: string | undefined): string | undefined {
  if (value == null) return value;
  return String(value).replace(/^[\s=+\-@\t\r]+/, "").slice(0, 120);
}

/** b31 H-10: one trade, as a key that matches across two files (overlapping exports). */
export function tradeKey(t: { ticker?: string; side?: string; type?: string; quantity?: number; price?: number; date?: string; executed_at?: string }): string {
  const day = lotCivilDay(String(t.date || t.executed_at || ""));
  const qty = Math.round((Number(t.quantity) || 0) * 1e8);
  const px = Math.round((Number(t.price) || 0) * 1e6);
  return `${String(t.ticker || "").toUpperCase()}|${String(t.side || t.type || "").toLowerCase()}|${qty}|${px}|${day}`;
}

/** Ref token as stamped by stampImportNote. */
function refOf(notes: string | null | undefined): string {
  return /(?:^|\s)ref=(\S+)/.exec(String(notes || ""))?.[1] || "";
}

type ImportUser = Parameters<typeof applyTransaction>[0];

interface LedgerRow {
  _id?: string;
  type?: string;
  ticker?: string;
  quantity?: number;
  notes?: string | null;
  executed_at?: string;
  price?: number;
}

function mappingOf(value: unknown): ColumnMap | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const mapping = {
    date: String(row.date || ""),
    ticker: String(row.ticker || ""),
    side: String(row.side || ""),
    quantity: String(row.quantity || ""),
    price: String(row.price || ""),
    fee: row.fee ? String(row.fee) : undefined,
    currency: row.currency ? String(row.currency) : undefined,
    fx: row.fx ? String(row.fx) : undefined,
  };
  return mappingReady(mapping) ? mapping : undefined;
}

function heldFrom(rows: readonly LedgerRow[]): Record<string, number> {
  const held: Record<string, number> = {};
  for (const row of rows) {
    const type = String(row.type || "").toLowerCase();
    if (type !== "buy" && type !== "sell") continue;
    const ticker = String(row.ticker || "").toUpperCase();
    const quantity = Number(row.quantity);
    if (!ticker || !(quantity > 0)) continue;
    held[ticker] = (held[ticker] || 0) + (type === "buy" ? quantity : -quantity);
  }
  return held;
}

async function loadLedger(userId: string): Promise<LedgerRow[]> {
  const res = await totalumSdk.crud.query("transaction", { _filter: { user: userId }, _limit: 5000 });
  return ((res?.data as unknown as LedgerRow[]) || []).map((row) => ({
    ...row,
    executed_at: row.executed_at || "",
  }));
}

async function previewWithRates(text: string, mapping: ColumnMap | undefined, held: Record<string, number>): Promise<ImportPreview> {
  const draft = await previewImport(text, { mapping, held });
  if (!draft.fxNeeds.length) return draft;
  const reviewedRates: Record<string, number | null> = {};
  for (const need of draft.fxNeeds) {
    const key = `${need.currency}|${need.date}`;
    if (key in reviewedRates) continue;
    reviewedRates[key] = await historicalNzdPerUnit(need.currency, need.date);
  }
  return previewImport(text, { mapping, held, reviewedRates });
}

function publicPreview(preview: ImportPreview) {
  return {
    broker: preview.broker,
    label: preview.label,
    headers: preview.headers,
    needsMapping: preview.needsMapping,
    suggested: preview.needsMapping ? suggestedColumnMap(preview.headers) : undefined,
    unreadable: preview.unreadable,
    errors: preview.errors,
    skipped: preview.skipped,
    toWrite: preview.toWrite.map((row) => ({
      line: row.line,
      date: row.date,
      ticker: row.ticker,
      side: row.side,
      quantity: row.quantity,
      price: row.price,
      fee: row.fee,
      currency: row.currency,
      fx: row.fx,
      cashEffectNzd: row.cashEffectNzd,
      brokerRef: row.brokerRef,
      assetName: row.assetName,
    })),
    cashNzd: preview.cashNzd,
    fileHash: preview.fileHash,
  };
}

async function capRefusal(user: ImportUser, rows: readonly ImportRow[]): Promise<NextResponse | null> {
  const res = await totalumSdk.crud.query("stock", { _filter: { user: user._id }, _limit: 1000 });
  const held = [...(((res?.data as unknown) as Array<{ ticker?: string; asset_type?: string; shares?: number }>) || [])];
  for (const row of rows) {
    if (row.side !== "buy") continue;
    const assetType = assetClassForSymbol(row.ticker) === "crypto" ? "crypto" : "stock";
    const sym = row.ticker.toUpperCase();
    if (held.some((item) => String(item.ticker || "").toUpperCase() === sym && (item.asset_type || "stock") === assetType)) continue;
    const quota = checkTickerQuota(user, held as never, assetType);
    if (!quota.allowed) {
      return NextResponse.json(
        { ok: false, error: `${quota.message} Nothing was written.`, data: { code: "ticker_limit", used: quota.used, limit: quota.limit, written: 0 } },
        { status: 403 }
      );
    }
    held.push({ ticker: sym, asset_type: assetType, shares: row.quantity });
  }
  return null;
}

/** Preview writes nothing. Commit writes the good rows. Undo removes that batch. */
/** Broker sync writes use their own bucket so manual imports and syncs never starve each other. */
export const BROKER_SYNC_WRITE_LIMIT = 12;
export const BROKER_SYNC_WRITE_WINDOW_MS = 60 * 60 * 1000;

/** `source` is set by server code only (never read from the request body). */
export async function runH10Import(user: ImportUser, text: string, body: unknown, source: "manual" | "broker-sync" = "manual"): Promise<NextResponse> {
  if (textTooLarge(text)) {
    return NextResponse.json({ ok: false, error: IMPORT_TOO_LARGE }, { status: 413 });
  }
  const input = (body && typeof body === "object" ? body : {}) as { action?: unknown; mapping?: unknown; batchId?: unknown };
  const action = input.action === "commit" || input.action === "undo" ? input.action : "preview";
  if (action !== "preview") {
    const limit =
      source === "broker-sync"
        ? await takeRateLimit(`broker-sync-write:${user._id}`, BROKER_SYNC_WRITE_LIMIT, BROKER_SYNC_WRITE_WINDOW_MS)
        : await takeRateLimit(`import:${user._id}`, IMPORT_WRITE_LIMIT, IMPORT_WRITE_WINDOW_MS);
    if (!limit.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many imports in a short time. Wait a few minutes. Nothing was written." },
        { status: 429, headers: { "Retry-After": String(limit.resetSec) } }
      );
    }
  }

  if (action === "undo") {
    const batchId = typeof input.batchId === "string" ? input.batchId.trim() : "";
    if (!batchId) {
      return NextResponse.json({ ok: false, error: "That import was not found. Nothing was changed." }, { status: 400 });
    }
    const stored = await loadLedger(user._id);
    // b87 H-10: plan the whole batch first (cash and holdings); on any refusal nothing is changed.
    const plan = planImportUndo({ ledger: stored as never, batchId, cashNzd: await currentCashNzd(user._id) });
    if (plan.ok === false) {
      return NextResponse.json({ ok: false, error: plan.error, data: { undone: 0, batchId } }, { status: plan.ids.length ? 400 : 404 });
    }
    const outcome = await undoImportInOrder(
      plan.ids,
      async (id) => {
        await planOrApplyLedgerReversal(id, true);
      }
    );
    invalidateBookCache(user._id);
    if (outcome.error) {
      return NextResponse.json(
        { ok: false, error: `${outcome.error} The undo stopped after ${outcome.undone.length} of ${plan.ids.length} rows; run undo again to finish.`, data: { undone: outcome.undone.length, batchId } },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, data: { undone: outcome.undone.length, batchId } });
  }

  const mapping = mappingOf(input.mapping);
  const stored = action === "commit" ? await loadLedger(user._id) : [];
  const preview = await previewWithRates(text, mapping, heldFrom(stored));
  if (action !== "commit") {
    return NextResponse.json({ ok: true, error: preview.error, data: publicPreview(preview) });
  }
  if (preview.needsMapping || preview.unreadable || !preview.toWrite.length) {
    return NextResponse.json({ ok: false, error: preview.error || "Nothing was written.", data: { ...publicPreview(preview), written: 0 } }, { status: 400 });
  }
  const fileHash = preview.fileHash || (await contentHash(text));
  if (stored.some((row) => notesHaveFile(row.notes, fileHash))) {
    return NextResponse.json({ ok: false, error: IMPORT_DUPLICATE_FILE, code: "duplicate_file", data: { written: 0 } }, { status: 409 });
  }
  // b31 H-10: row-level duplicates. A trade already in the book from another file (same broker
  // ref, or same ticker/side/units/price/day on an imported row) is skipped and listed.
  const importedRows = stored.filter((row) => /(?:^|\s)batch=/.test(String(row.notes || "")));
  const knownRefs = new Set(importedRows.map((row) => refOf(row.notes)).filter(Boolean));
  const knownTrades = new Set(importedRows.map((row) => tradeKey(row)));
  const duplicates: number[] = [];
  const fresh = preview.toWrite.filter((row) => {
    const ref = String(row.brokerRef || "").trim().replace(/\s+/g, "");
    const dup = (ref && knownRefs.has(ref)) || knownTrades.has(tradeKey(row));
    if (dup) duplicates.push(row.line);
    return !dup;
  });
  if (!fresh.length) {
    return NextResponse.json({ ok: false, error: IMPORT_DUPLICATE_FILE, code: "duplicate_rows", data: { written: 0, duplicates } }, { status: 409 });
  }
  preview.toWrite = fresh;
  const cap = await capRefusal(user, preview.toWrite);
  if (cap) return cap;

  const batchId = batchIdForHash(fileHash);
  // b90 FX-1: each trade-date rate is fetched up front (full lookup timeout), so the broker's
  // rate is checked against the trade date, never against today's rate.
  const tradeDateFx: Record<string, number | null> = {};
  for (const row of preview.toWrite) {
    if (row.currency === "NZD") continue;
    const key = `${row.currency}|${row.date}`;
    if (!(key in tradeDateFx)) tradeDateFx[key] = await historicalNzdPerUnit(row.currency, row.date);
  }
  const label = preview.label || "broker";
  const written: ImportRow[] = [];
  // b85 H-10: all or nothing. A failure removes every row this commit saved, newest first.
  const savedRows: { id: string; previousCash: number; restoreHolding?: () => Promise<void> }[] = [];
  const setCash = (cash: number) => {
    (user as { cash_balance?: number; cash_read_at?: number }).cash_balance = cash;
    (user as { cash_read_at?: number }).cash_read_at = Date.now();
  };
  const unwind = async () => {
    for (const done of [...savedRows].reverse()) {
      try {
        await totalumSdk.crud.deleteRecordById("transaction", done.id);
        if (done.restoreHolding) await done.restoreHolding();
        await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: done.previousCash });
        setCash(done.previousCash);
      } catch (err) {
        console.error("[import] rollback failed:", err);
      }
    }
    written.length = 0;
  };
  for (const row of preview.toWrite) {
    let saved: Awaited<ReturnType<typeof applyTransaction>>;
    try {
      saved = await applyTransaction(user, {
        type: row.side,
        ticker: row.ticker,
        asset_type: assetClassForSymbol(row.ticker),
        asset_name: safeImportText(row.assetName),
        quantity: row.quantity,
        price: row.price,
        fees: row.fee,
        fx_rate: row.fx,
        fx_source: "broker-file",
        fill_currency: row.currency,
        trade_date_fx: row.currency === "NZD" ? undefined : tradeDateFx[`${row.currency}|${row.date}`] ?? undefined,
        executed_at: row.date,
        trade_date: row.date,
        price_source: "broker_import",
        broker: preview.broker || "file",
        notes: stampFileHash(stampImportNote(`Imported from a ${label} file.`, batchId, row.brokerRef), fileHash),
        deferCash: true,
      });
    } catch (err) {
      await unwind();
      invalidateBookCache(user._id);
      const message = err instanceof Error ? err.message : "The import was not saved.";
      return NextResponse.json(
        { ok: false, error: `${message} Saved before this failure: ${written.length}.`, data: { ...publicPreview(preview), written: written.length, batchId } },
        { status: 400 }
      );
    }
    if (!saved.ledgerId || saved.pendingCash == null || saved.previousCash == null) {
      await unwind();
      invalidateBookCache(user._id);
      return NextResponse.json({ ok: false, error: `Line ${row.line} was not saved.`, data: { written: written.length, batchId } }, { status: 400 });
    }
    try {
      await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: saved.pendingCash });
    } catch (err) {
      await totalumSdk.crud.deleteRecordById("transaction", saved.ledgerId);
      if (saved.restoreHolding) await saved.restoreHolding();
      await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: saved.previousCash });
      await unwind();
      invalidateBookCache(user._id);
      const message = err instanceof Error ? err.message : "The cash update failed.";
      return NextResponse.json(
        { ok: false, error: `${message} The failed row was removed. Saved before this failure: ${written.length}.`, data: { written: written.length, batchId } },
        { status: 400 }
      );
    }
    setCash(saved.pendingCash);
    savedRows.push({ id: saved.ledgerId, previousCash: saved.previousCash, restoreHolding: saved.restoreHolding });
    written.push(row);
  }
  invalidateBookCache(user._id);
  // Sum in cents so the total matches the rows to NZ$0.01.
  const cash = written.reduce((sum, row) => sum + Math.round(row.cashEffectNzd * 100), 0) / 100;
  return NextResponse.json({
    ok: true,
    data: {
      ...publicPreview(preview),
      written: written.length,
      batchId,
      duplicates,
      summary: `${written.length} trade${written.length === 1 ? "" : "s"} saved. Cash effect ${formatNzd(cash)}.`,
    },
  });
}
