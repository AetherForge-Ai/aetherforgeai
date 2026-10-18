import { CSV_LOCK_LABEL } from "@/lib/csv-lock-label";
import { NextResponse } from "next/server";
import { dividendCsv, dividendViewFromRow } from "@/lib/dividend-ledger";
import { formatDisplayDate } from "@/lib/currency";
import { canExportCsv } from "@/lib/entitlements";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import { getStableSessionUser } from "@/lib/session";
import { aucklandCivilToday, inNzTaxYear, isNzTaxYearEnding, nzTaxYearEnding } from "@/lib/nz-tax-year";
import { aucklandDateISO } from "@/lib/fill-integrity";
import { datedTaxCsvName } from "@/lib/lot-day";
import { loadDividendRows } from "@/lib/tax-book-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/tax/dividends/export
 * Paid plans only, same gate as the transaction CSV. Indicative, not tax advice.
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
    const requested = Number(new URL(req.url).searchParams.get("year"));
    const endingYear = isNzTaxYearEnding(requested) ? requested : nzTaxYearEnding(aucklandCivilToday());
    const rows = (await loadDividendRows(user._id))
      .map(dividendViewFromRow)
      .filter((row) => (endingYear == null ? true : inNzTaxYear(row.when, endingYear)));
    const csv = dividendCsv(rows, (value) => {
      const shown = formatDisplayDate(value);
      return shown === "—" ? "" : shown;
    });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${datedTaxCsvName("dividend-ledger", endingYear ?? "book", aucklandDateISO())}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to export the dividend ledger";
    console.error("[api/tax/dividends/export] GET error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
