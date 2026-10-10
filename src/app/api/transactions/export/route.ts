import { NextResponse } from "next/server";
import { getStableSessionUser } from "@/lib/session";
import { canExportCsv } from "@/lib/entitlements";
import { loadLedger, type TransactionRow } from "@/lib/transactions";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import { CSV_EXPORT_COLUMNS } from "@/lib/ledger-schema";
import { csvEscape, transactionCsvCells, type CsvRow } from "@/lib/transaction-csv";

export const dynamic = "force-dynamic";

function rowCells(t: TransactionRow): string[] {
  return transactionCsvCells(t as TransactionRow & CsvRow).map((value) => csvEscape(value));
}

const HEADERS: readonly string[] = CSV_EXPORT_COLUMNS;

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
