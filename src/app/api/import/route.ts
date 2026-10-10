import { NextResponse } from "next/server";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import {
  importDuplicateKey,
  importWrites,
  planBrokerImport,
  type ColumnMap,
  type ImportPlan,
  type ImportTrade,
} from "@/lib/broker-import";
import { supportHold } from "@/lib/broker-import-hold";
import { lotCivilDay } from "@/lib/executed-at";
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
    unsupported: plan.unsupported,
    duplicateCount: plan.duplicates.length,
    toWrite: plan.toWrite,
    fundingDeposits: plan.fundingDeposits,
    sourceTotals: plan.sourceTotals,
    importedTotals: plan.importedTotals,
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

async function existingKeys(userId: string): Promise<string[]> {
  const res = await totalumSdk.crud.query("transaction", {
    _filter: { user: userId },
    _limit: 5000,
  });
  const keys: string[] = [];
  for (const row of (res?.data as Array<Record<string, unknown>>) || []) {
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
    const openingCashNzd = typeof user.cash_balance === "number" ? user.cash_balance : 0;
    const preview = planBrokerImport(text, { mapping, openingCashNzd });
    if (body.confirm !== true || !importWrites(preview)) {
      return NextResponse.json({
        ok: preview.error == null,
        error: preview.error,
        data: publicPlan(preview),
      });
    }

    const committed = planBrokerImport(text, {
      mapping,
      openingCashNzd,
      existingKeys: await existingKeys(user._id),
    });
    if (!importWrites(committed)) {
      return NextResponse.json({
        ok: committed.error == null,
        error: committed.error,
        data: { ...publicPlan(committed), written: 0 },
      });
    }

    const written: ImportTrade[] = [];
    for (const deposit of committed.fundingDeposits) {
      await applyTransaction(user, {
        type: "deposit",
        amount: deposit.amountNzd,
        executed_at: deposit.date,
        trade_date: deposit.date,
        notes: deposit.note,
      });
    }
    const ordered = [...committed.toWrite].sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line);
    for (const row of ordered) {
      await applyTransaction(user, {
        type: row.side,
        ticker: row.ticker,
        asset_type: "stock",
        quantity: row.quantity,
        price: row.price,
        fees: row.fee,
        fx_rate: row.fx,
        fx_source: "broker-file",
        executed_at: row.date,
        trade_date: row.date,
        price_source: "broker_import",
        broker: committed.broker || "file",
        notes: `Imported from a ${committed.broker || "broker"} file.`,
      });
      written.push(row);
    }

    return NextResponse.json({
      ok: true,
      data: { ...publicPlan(committed), written: written.length },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "The import was not saved.";
    console.error("[api/import] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
