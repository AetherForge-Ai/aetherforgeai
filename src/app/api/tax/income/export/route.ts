import { NextResponse } from "next/server";
import { formatDisplayDate } from "@/lib/currency";
import { canExportCsv } from "@/lib/entitlements";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import { aucklandCivilToday, isNzTaxYearEnding, nzTaxYearEnding } from "@/lib/nz-tax-year";
import { getStableSessionUser } from "@/lib/session";
import { loadTaxRows } from "@/lib/tax-book-server";
import { taxableIncome, taxableIncomeCsv } from "@/lib/taxable-income";

export const dynamic = "force-dynamic";

/** GET /api/tax/income/export?year=2027 — paid plans, same gate as the transaction CSV. */
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
    const requested = Number(new URL(req.url).searchParams.get("year"));
    const endingYear = isNzTaxYearEnding(requested) ? requested : nzTaxYearEnding(aucklandCivilToday());
    if (endingYear == null) {
      return NextResponse.json({ ok: false, error: "Tax year was not recognised." }, { status: 400 });
    }
    const report = taxableIncome(await loadTaxRows(user._id), endingYear);
    const csv = taxableIncomeCsv(report, (value) => {
      const shown = formatDisplayDate(value);
      return shown === "—" ? "" : shown;
    });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="taxable-income-${endingYear}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to export taxable income";
    console.error("[api/tax/income/export] GET error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
