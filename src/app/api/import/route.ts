import { NextResponse } from "next/server";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import {
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
import { backdatedRealisedNote } from "@/lib/fifo-cost";
import type { TaxLedgerRow } from "@/lib/taxable-income";
import { supportHold } from "@/lib/broker-import-hold";
import { lotCivilDay } from "@/lib/executed-at";
import { historicalNzdPerUnit } from "@/lib/fx";
import { getTradeSessionUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { applyTransaction } from "@/lib/transactions";

export const dynamic = "force-dynamic";

const MAX_CHARS = 1_000_000;

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
  };
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
    keys.push(importDuplicateKey({ date, ticker, side: type, quantity, price }));
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

    const body = (await req.json().catch(() => ({}))) as {
      text?: unknown;
      confirm?: unknown;
      consent?: unknown;
      action?: unknown;
      mapping?: unknown;
      acknowledgeSkipped?: unknown;
      fundBuys?: unknown;
    };
    const text = typeof body.text === "string" ? body.text : "";
    if (text.length > MAX_CHARS) {
      return NextResponse.json({ ok: false, error: "That file is too large. Nothing was written." }, { status: 400 });
    }

    if (body.action === "hold") {
      const hold = supportHold(text, body.consent === true);
      return NextResponse.json({ ok: true, data: hold });
    }

    const mapping = mappingOf(body.mapping);
    const acknowledgeSkipped = body.acknowledgeSkipped === true;
    const fundBuys = body.fundBuys === true;
    const openingCashNzd = typeof user.cash_balance === "number" ? user.cash_balance : 0;
    if (body.confirm !== true) {
      const draft = planBrokerImport(text, { mapping, openingCashNzd, fundBuys });
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
    try {
      for (const step of importWriteOrder(committed)) {
        if (step.kind === "deposit") {
          await applyTransaction(user, {
            type: "deposit",
            amount: step.amountNzd,
            executed_at: step.date,
            trade_date: step.date,
            notes: step.note,
          });
          writtenDeposits.push({ date: step.date, amountNzd: step.amountNzd || 0 });
          continue;
        }
        const row = step.trade;
        if (!row) continue;
        await applyTransaction(user, {
          type: row.side,
          ticker: row.ticker,
          asset_type: "stock",
          quantity: row.quantity,
          price: row.price,
          fees: row.fee,
          fx_rate: row.fx,
          fx_source: row.fxSource === "reviewed-trade-date" ? "reviewed-trade-date" : "broker-file",
          fill_currency: row.currency,
          executed_at: row.date,
          trade_date: row.date,
          price_source: "broker_import",
          broker: committed.broker || "file",
          notes:
            row.fxSource === "reviewed-trade-date"
              ? `Imported from a ${committed.broker || "broker"} file. Exchange rate: reviewed rate for the trade date.`
              : `Imported from a ${committed.broker || "broker"} file.`,
        });
        written.push(row);
      }
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : "The import was not saved.";
      console.error("[api/import] write failed:", cause);
      return NextResponse.json(
        {
          ok: false,
          error: importFailureReport({
            cause,
            writtenTrades: written,
            writtenDeposits,
          }),
          data: planPayload(committed, fresh, {
            written: written.length,
            writtenTrades: written.map((row) => ({ date: row.date, side: row.side, ticker: row.ticker })),
            writtenDeposits,
          }),
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: planPayload(committed, fresh, { written: written.length }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "The import was not saved.";
    console.error("[api/import] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
