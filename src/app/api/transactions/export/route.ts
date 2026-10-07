import { NextResponse } from "next/server";
import { formatSavedFx } from "@/lib/currency";
import { getStableSessionUser } from "@/lib/session";
import { canExportCsv } from "@/lib/entitlements";
import { loadLedger, type TransactionRow } from "@/lib/transactions";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";

export const dynamic = "force-dynamic";

function cell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function rowCells(t: TransactionRow): string[] {
  const extra = t as TransactionRow & Record<string, unknown>;
  return [
    csvDate(t.executed_at || t.createdAt),
    String(extra.trade_datetime || csvDate(t.executed_at || t.createdAt)),
    String(extra.execution_status || "filled"),
    t.type,
    t.ticker || "",
    t.asset_name || "",
    t.asset_type || "",
    String(extra.asset_id || ""),
    t.quantity ?? "",
    extra.fill_price ?? t.price ?? "",
    String(extra.fill_currency || t.currency || "NZD"),
    String(extra.price_source || "user_fill"),
    String(extra.price_as_at || ""),
    extra.signal_price ?? "",
    extra.mark_price ?? "",
    extra.fees_native ?? t.fees ?? "",
    extra.fees_nzd ?? "",
    extra.native_notional ?? (t.quantity && t.price ? t.quantity * t.price : ""),
    formatSavedFx(extra.fx_rate),
    String(extra.fx_source || ""),
    extra.cash_nzd ?? t.total ?? "",
    extra.realized_price_pnl_nzd ?? "",
    extra.realized_fx_pnl_nzd ?? "",
    extra.realized_pnl_nzd ?? t.realized_pnl ?? "",
    String(extra.order_sizing || "units"),
    extra.notional_native ?? "",
    String(extra.broker || ""),
    t.notes || "",
  ].map((v) => cell(v));
}

const HEADERS = [
  "Date",
  "DateTime_NZ",
  "ExecutionStatus",
  "Type",
  "Ticker",
  "AssetName",
  "AssetType",
  "AssetId",
  "Quantity",
  "FillPrice",
  "FillCurrency",
  "PriceSource",
  "PriceAsAt",
  "SignalPrice",
  "MarkPriceAtExport",
  "FeesNative",
  "FeesNZD",
  "NativeNotional",
  "FxRate",
  "FxSource",
  "CashNZD",
  "RealizedPricePnlNZD",
  "RealizedFxPnlNZD",
  "RealizedPnlNZD",
  "OrderSizing",
  "NotionalNative",
  "Broker",
  "Notes",
];

/**
 * GET /api/transactions/export
 * Paid plans only. Free is refused here even if the browser already has the rows.
 */
export async function GET(req: Request) {
  try {
    const user = await getStableSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      return accountMismatchResponse(user._id);
    }
    if (!canExportCsv(user.subscription_plan)) {
      return NextResponse.json(
        { ok: false, error: "CSV export is included on Starter and above.", data: { code: "not_entitled" } },
        { status: 403 }
      );
    }

    const ledger = await loadLedger(user, 1000);
    const lines = ledger.transactions.map((t) => rowCells(t).join(","));
    const csv = [HEADERS.join(","), ...lines].join("\n");
    const filename = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to export transactions";
    console.error("[api/transactions/export] GET error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
