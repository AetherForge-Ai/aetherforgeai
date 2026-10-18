/**
 * Save an H-10 preview onto the existing paper book.
 * Rows go to the transaction table the ledger already uses. The file hash and
 * the batch id are stamps in the notes field (file= and batch=). No new table.
 */

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

type ImportUser = Parameters<typeof applyTransaction>[0];

interface LedgerRow {
  _id?: string;
  type?: string;
  ticker?: string;
  quantity?: number;
  notes?: string | null;
  executed_at?: string;
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
export async function runH10Import(user: ImportUser, text: string, body: unknown): Promise<NextResponse> {
  if (textTooLarge(text)) {
    return NextResponse.json({ ok: false, error: IMPORT_TOO_LARGE }, { status: 413 });
  }
  const input = (body && typeof body === "object" ? body : {}) as { action?: unknown; mapping?: unknown; batchId?: unknown };
  const action = input.action === "commit" || input.action === "undo" ? input.action : "preview";

  if (action === "undo") {
    const batchId = typeof input.batchId === "string" ? input.batchId.trim() : "";
    if (!batchId) {
      return NextResponse.json({ ok: false, error: "That import was not found. Nothing was changed." }, { status: 400 });
    }
    const stored = await loadLedger(user._id);
    const mine = stored
      .filter((row) => notesHaveBatch(row.notes, batchId) && row._id)
      .sort((a, b) => String(b.executed_at || "").localeCompare(String(a.executed_at || "")));
    const outcome = await undoImportInOrder(
      mine.map((row) => String(row._id)),
      async (id) => {
        await planOrApplyLedgerReversal(id, true);
      }
    );
    invalidateBookCache(user._id);
    if (outcome.error) {
      return NextResponse.json(
        { ok: false, error: `${outcome.error} Undone before this failure: ${outcome.undone.length}.`, data: { undone: outcome.undone.length, batchId } },
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
  const cap = await capRefusal(user, preview.toWrite);
  if (cap) return cap;

  const batchId = batchIdForHash(fileHash);
  const label = preview.label || "broker";
  const written: ImportRow[] = [];
  for (const row of preview.toWrite) {
    let saved: Awaited<ReturnType<typeof applyTransaction>>;
    try {
      saved = await applyTransaction(user, {
        type: row.side,
        ticker: row.ticker,
        asset_type: assetClassForSymbol(row.ticker),
        asset_name: row.assetName,
        quantity: row.quantity,
        price: row.price,
        fees: row.fee,
        fx_rate: row.fx,
        fx_source: "broker-file",
        fill_currency: row.currency,
        executed_at: row.date,
        trade_date: row.date,
        price_source: "broker_import",
        broker: preview.broker || "file",
        notes: stampFileHash(stampImportNote(`Imported from a ${label} file.`, batchId, row.brokerRef), fileHash),
        deferCash: true,
      });
    } catch (err) {
      invalidateBookCache(user._id);
      const message = err instanceof Error ? err.message : "The import was not saved.";
      return NextResponse.json(
        { ok: false, error: `${message} Saved before this failure: ${written.length}.`, data: { ...publicPreview(preview), written: written.length, batchId } },
        { status: 400 }
      );
    }
    if (!saved.ledgerId || saved.pendingCash == null || saved.previousCash == null) {
      return NextResponse.json({ ok: false, error: `Line ${row.line} was not saved.`, data: { written: written.length, batchId } }, { status: 400 });
    }
    try {
      await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: saved.pendingCash });
    } catch (err) {
      await totalumSdk.crud.deleteRecordById("transaction", saved.ledgerId);
      if (saved.restoreHolding) await saved.restoreHolding();
      await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: saved.previousCash });
      invalidateBookCache(user._id);
      const message = err instanceof Error ? err.message : "The cash update failed.";
      return NextResponse.json(
        { ok: false, error: `${message} The failed row was removed. Saved before this failure: ${written.length}.`, data: { written: written.length, batchId } },
        { status: 400 }
      );
    }
    written.push(row);
  }
  invalidateBookCache(user._id);
  const cash = written.reduce((sum, row) => sum + row.cashEffectNzd, 0);
  return NextResponse.json({
    ok: true,
    data: {
      ...publicPreview(preview),
      written: written.length,
      batchId,
      summary: `${written.length} trade${written.length === 1 ? "" : "s"} saved. Cash effect ${formatNzd(cash)}.`,
    },
  });
}
