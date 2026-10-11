import { NextResponse } from "next/server";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import { canExportCsv } from "@/lib/entitlements";
import { buildFifPaper, marketsFromNotes } from "@/lib/fif-working-paper";
import { aucklandCivilToday, isNzTaxYearEnding, nzTaxYearEnding } from "@/lib/nz-tax-year";
import { getStableSessionUser } from "@/lib/session";
import { loadStockNoteRows, loadTaxRows } from "@/lib/tax-book-server";
import { fifCsv } from "@/lib/tax-pack";

export const dynamic = "force-dynamic";

/** GET /api/tax/fif/export?year=2027 — paid plans. A missing rate leaves the peak-cost cell blank. */
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
    const [rows, stocks] = await Promise.all([loadTaxRows(user._id), loadStockNoteRows(user._id)]);
    const csv = fifCsv(buildFifPaper({ rows, markets: marketsFromNotes(stocks, endingYear), endingYear }));
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fif-${endingYear}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to export the FIF paper";
    console.error("[api/tax/fif/export] GET error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
