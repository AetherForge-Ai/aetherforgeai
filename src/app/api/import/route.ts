import { IMPORT_MAX_BYTES, IMPORT_TOO_LARGE, importTextTooLarge } from "@/lib/import-limits";
import { NextResponse } from "next/server";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import {
  brokerRefFromNotes,
  importDuplicateKey,
  importFailureReport,
  importWriteOrder,
  importWrites,
  planBrokerImport,
  validateImportForWrite,
  type ColumnMap,
  type ImportPlan,
  type ImportTrade,
} from "@/lib/broker-import";
import { commitImportInOrder, newImportBatchId, notesHaveBatch, stampImportNote, undoImportInOrder } from "@/lib/import-commit";
import { assetClassForSymbol } from "@/lib/import-symbols";
import { planOrApplyLedgerReversal } from "@/lib/ledger-reversal-apply";
import { backdatedRealisedNote } from "@/lib/fifo-cost";
import type { TaxLedgerRow } from "@/lib/taxable-income";
import { supportHold } from "@/lib/broker-import-hold";
import { formatNzd, roundMoney } from "@/lib/currency";
import { lotCivilDay } from "@/lib/executed-at";
import { historicalNzdPerUnit } from "@/lib/fx";
import { getTradeSessionUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { applyTransaction } from "@/lib/transactions";

export const dynamic = "force-dynamic";


function publicPlan(plan: ImportPlan) {
  return {
    broker: plan.broker,
    error: plan.error,
    headers: plan.headers,
    needsMapping: plan.needsMapping,
    unreadable: plan.unreadable,
    unsupported: plan.unsupported,
    duplicateCount: plan.duplicates.length,
    duplicates: plan.duplicates.map((row) => ({ line: row.line, date: row.date, ticker: row.ticker, side: row.side })),
    toWrite: plan.toWrite,
    fundingDeposits: plan.fundingDeposits,
    fundingNeeded: plan.fundingNeeded,
    sourceTotals: plan.sourceTotals,
    importedTotals: plan.importedTotals,
    totalsMessage: plan.totalsMessage,
    detection: plan.detection,
    flagged: plan.duplicates,
  };
}

function fixesOf(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const fixes: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(key)) continue;
    const ticker = String(raw || "").trim().toUpperCase();
    if (ticker) fixes[key] = ticker;
  }
  return Object.keys(fixes).length ? fixes : undefined;
}

function mappingOf(value: unknown): ColumnMap | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const date = String(row.date || "");
  const ticker = String(row.ticker || "");
  const side = String(row.side || "");
  const quantity = String(row.quantity || "");
  const price = String(row.price || "");
  if (!date || !ticker || !side || !quantity || !price) return undefined;
  return {
    date,
    ticker,
    side,
    quantity,
    price,
    fee: row.fee ? String(row.fee) : undefined,
    currency: row.currency ? String(row.currency) : undefined,
    fx: row.fx ? String(row.fx) : undefined,
    value: row.value ? String(row.value) : undefined,
  };
}

async function bookRows(userId: string): Promise<TaxLedgerRow[]> {
  const res = await totalumSdk.crud.query("transaction", {
    _filter: { user: userId },
    _limit: 5000,
  });
  return ((res?.data as unknown as TaxLedgerRow[]) || []).map((row) => ({
    ...row,
    executed_at: row.executed_at || row.createdAt || "",
  }));
}

function keysFrom(rows: readonly TaxLedgerRow[]): string[] {
  const keys: string[] = [];
  for (const row of rows) {
    const type = String(row.type || "").toLowerCase();
    if (type !== "buy" && type !== "sell") continue;
    const date = lotCivilDay(String(row.trade_date || row.executed_at || ""), "");
    const quantity = Number(row.quantity);
    const price = Number(row.price);
    const ticker = String(row.ticker || "");
    if (!date || !ticker || !(quantity > 0) || !(price > 0)) continue;
    keys.push(
      importDuplicateKey({
        date,
        ticker,
        side: type,
        quantity,
        price,
        brokerRef: brokerRefFromNotes(row.notes),
      })
    );
  }
  return keys;
}

function planPayload(plan: ImportPlan, rows: readonly TaxLedgerRow[], extra?: Record<string, unknown>) {
  return {
    ...publicPlan(plan),
    fifoNote: backdatedRealisedNote(rows, plan.toWrite),
    ...extra,
  };
}

async function planWithReviewedFx(
  text: string,
  options: {
    mapping?: ColumnMap;
    existingKeys?: Iterable<string>;
    openingCashNzd?: number;
    fundBuys?: boolean;
    tickerFixes?: Record<string, string>;
  }
) {
  const draft = planBrokerImport(text, options);
  if (!draft.fxNeeds.length) return draft;
  const reviewedRates: Record<string, number | null> = {};
  for (const need of draft.fxNeeds) {
    const key = `${need.currency}|${need.date}`;
    if (key in reviewedRates) continue;
    reviewedRates[key] = await historicalNzdPerUnit(need.currency, need.date);
  }
  return planBrokerImport(text, { ...options, reviewedRates });
}

/** POST /api/import — preview writes nothing. Commit writes only a clean plan. */
export async function POST(req: Request) {
  try {
    const user = await getTradeSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      return accountMismatchResponse(user._id);
    }

    // H-10: refuse anything over 5 MB before reading it.
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > IMPORT_MAX_BYTES + 64 * 1024) {
      return NextResponse.json({ ok: false, error: IMPORT_TOO_LARGE }, { status: 413 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      text?: unknown;
      confirm?: unknown;
      consent?: unknown;
      action?: unknown;
      mapping?: unknown;
      acknowledgeSkipped?: unknown;
      fundBuys?: unknown;
      batchId?: unknown;
      tickerFixes?: unknown;
    };
    const text = typeof body.text === "string" ? body.text : "";
    if (importTextTooLarge(text)) {
      return NextResponse.json({ ok: false, error: IMPORT_TOO_LARGE }, { status: 413 });
    }

    if (body.action === "hold") {
      const hold = supportHold(text, body.consent === true);
      return NextResponse.json({ ok: true, data: hold });
    }

    if (body.action === "undo") {
      const batchId = typeof body.batchId === "string" ? body.batchId.trim() : "";
      if (!batchId) {
        return NextResponse.json({ ok: false, error: "That import was not found. Nothing was changed." }, { status: 400 });
      }
      const loadLedger = bookRows;
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
      if (outcome.error) {
        return NextResponse.json(
          {
            ok: false,
            error: `${outcome.error} Undone before this failure: ${outcome.undone.length}.`,
            data: { undone: outcome.undone.length, batchId },
          },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        data: { undone: outcome.undone.length, batchId },
      });
    }

    const mapping = mappingOf(body.mapping);
    const tickerFixes = fixesOf(body.tickerFixes);
    const acknowledgeSkipped = body.acknowledgeSkipped === true;
    const fundBuys = body.fundBuys === true;
    const openingCashNzd = typeof user.cash_balance === "number" ? user.cash_balance : 0;
    if (body.confirm !== true) {
      const draft = await planWithReviewedFx(text, { mapping, openingCashNzd, fundBuys, tickerFixes });
      if (draft.needsMapping) {
        return NextResponse.json({
          ok: true,
          needsMapping: true,
          error: draft.error,
          data: { ...publicPlan(draft), fifoNote: null },
        });
      }
    }
    const stored = await bookRows(user._id);
    const preview = await planWithReviewedFx(text, {
      mapping,
      openingCashNzd,
      fundBuys,
      existingKeys: keysFrom(stored),
      tickerFixes,
    });
    if (body.confirm !== true || !importWrites(preview, acknowledgeSkipped)) {
      const blocked = body.confirm === true && !importWrites(preview, acknowledgeSkipped);
      return NextResponse.json({
        ok: blocked ? false : preview.error == null,
        error: blocked ? validateImportForWrite(preview, acknowledgeSkipped) || preview.error : preview.error,
        data: planPayload(preview, stored),
      });
    }

    const fresh = await bookRows(user._id);
    const committed = await planWithReviewedFx(text, {
      mapping,
      openingCashNzd,
      fundBuys,
      existingKeys: keysFrom(fresh),
      tickerFixes,
    });
    const invalid = validateImportForWrite(committed, acknowledgeSkipped);
    if (invalid || !importWrites(committed, acknowledgeSkipped)) {
      return NextResponse.json({
        ok: false,
        error: invalid || committed.error || "Nothing was written.",
        data: planPayload(committed, fresh, { written: 0 }),
      });
    }

    const written: ImportTrade[] = [];
    const writtenDeposits: { date: string; amountNzd: number }[] = [];
    const batchId = newImportBatchId();
    const brokerLabel = committed.detection?.label || committed.broker || "broker";
    const outcome = await commitImportInOrder(importWriteOrder(committed), {
      writeTrade: async (step) => {
        if (step.kind === "deposit") {
          const result = await applyTransaction(user, {
            type: "deposit",
            amount: step.amountNzd,
            executed_at: step.date,
            trade_date: step.date,
            notes: stampImportNote(step.note || "", batchId, ""),
            deferCash: true,
          });
          if (!result.ledgerId || result.pendingCash == null || result.previousCash == null) {
            throw new Error("The paper deposit was not saved");
          }
          return {
            id: result.ledgerId,
            pendingCash: result.pendingCash,
            previousCash: result.previousCash,
            restoreHolding: result.restoreHolding,
          };
        }
        const row = step.trade;
        if (!row) throw new Error("A trade row was missing. Nothing further was saved.");
        const note =
          row.fxSource === "reviewed-trade-date"
            ? `Imported from a ${brokerLabel} file. Exchange rate: reviewed rate for the trade date.`
            : `Imported from a ${brokerLabel} file.`;
        const result = await applyTransaction(user, {
          type: row.side,
          ticker: row.ticker,
          asset_type: assetClassForSymbol(row.ticker),
          asset_name: row.assetName,
          quantity: row.quantity,
          price: row.price,
          fees: row.fee,
          fx_rate: row.fx,
          fx_source: row.fxSource === "reviewed-trade-date" ? "reviewed-trade-date" : "broker-file",
          fill_currency: row.currency,
          executed_at: row.executedAt || row.date,
          trade_date: row.date,
          price_source: "broker_import",
          broker: committed.broker || "file",
          notes: stampImportNote(note, batchId, row.brokerRef),
          deferCash: true,
        });
        if (!result.ledgerId || result.pendingCash == null || result.previousCash == null) {
          throw new Error(`Line ${row.line} was not saved`);
        }
        return {
          id: result.ledgerId,
          pendingCash: result.pendingCash,
          previousCash: result.previousCash,
          restoreHolding: result.restoreHolding,
        };
      },
      writeCash: async (step, trade) => {
        await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: trade.pendingCash });
        if (step.kind === "deposit") writtenDeposits.push({ date: step.date, amountNzd: step.amountNzd || 0 });
        else if (step.trade) written.push(step.trade);
      },
      rollbackTrade: async (trade) => {
        await totalumSdk.crud.deleteRecordById("transaction", trade.id);
        if (trade.restoreHolding) await trade.restoreHolding();
        await totalumSdk.crud.editRecordById("user", user._id, { cash_balance: trade.previousCash });
      },
    });
    if (outcome.error) {
      console.error("[api/import] write failed:", outcome.error);
      return NextResponse.json(
        {
          ok: false,
          error: importFailureReport({
            cause: outcome.rolledBack
              ? `${outcome.error} The failed row was removed.`
              : outcome.error,
            writtenTrades: written,
            writtenDeposits,
          }),
          data: planPayload(committed, fresh, {
            written: written.length,
            batchId,
            rolledBack: outcome.rolledBack,
            writtenTrades: written.map((row) => ({ date: row.date, side: row.side, ticker: row.ticker })),
            writtenDeposits,
          }),
        },
        { status: 400 }
      );
    }

    const cashEffect = roundMoney(
      written.reduce((sum, row) => sum + row.cashEffectNzd, 0) + writtenDeposits.reduce((sum, row) => sum + row.amountNzd, 0)
    );
    return NextResponse.json({
      ok: true,
      data: planPayload(committed, fresh, {
        written: written.length,
        batchId,
        summary: `${written.length} trade${written.length === 1 ? "" : "s"} saved. Cash effect ${formatNzd(cashEffect)}.`,
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "The import was not saved.";
    console.error("[api/import] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
