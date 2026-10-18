import { CSV_LOCK_LABEL } from "@/lib/csv-lock-label";
import { NextResponse } from "next/server";
import { getStableSessionUser } from "@/lib/session";
import { canExportCsv } from "@/lib/entitlements";
import { loadLedger, type TransactionRow } from "@/lib/transactions";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import { attachFifoRealised } from "@/lib/fifo-cost";
import { CSV_EXPORT_COLUMNS } from "@/lib/ledger-schema";
import { csvEscape, transactionCsvCells, type CsvRow } from "@/lib/transaction-csv";
import type { TaxLedgerRow } from "@/lib/taxable-income";
import { aucklandDateISO } from "@/lib/fill-integrity";
import { buildPortfolioSnapshot, type SnapshotLedgerRow } from "@/lib/portfolio-snapshot";
import { xeroStatementCsv } from "@/lib/xero-csv";

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
        { ok: false, error: `${CSV_LOCK_LABEL}.`, data: { code: "not_entitled" } },
        { status: 403 }
      );
    }

    const ledger = await loadLedger(user, 5000);
    // Goal b19 G-29: ?format=xero returns a Xero bank-statement CSV of NZD cash movements.
    if (new URL(req.url).searchParams.get("format") === "xero") {
      const snap = buildPortfolioSnapshot({ rows: ledger.transactions as SnapshotLedgerRow[], asOf: new Date().toISOString() });
      const { csv, rows: count, skipped } = xeroStatementCsv(snap.ledger);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="xero-statement-${aucklandDateISO()}.csv"`,
          "Cache-Control": "no-store",
          "X-Xero-Rows": String(count),
          "X-Xero-Skipped": String(skipped),
        },
      });
    }
    const rows = attachFifoRealised(ledger.transactions as unknown as TaxLedgerRow[]);
    const lines = rows.map((t) => rowCells(t as TransactionRow).join(","));
    const csv = `${[HEADERS.join(","), ...lines].join("\n")}\n`;
    const filename = `transactions-${aucklandDateISO()}.csv`;
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
