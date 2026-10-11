import { NextResponse } from "next/server";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import { formatDisplayDate } from "@/lib/currency";
import { canExportCsv } from "@/lib/entitlements";
import { aucklandCivilToday, isNzTaxYearEnding, nzTaxYearEnding } from "@/lib/nz-tax-year";
import { getStableSessionUser } from "@/lib/session";
import { loadTaxRows } from "@/lib/tax-book-server";
import { cryptoDisposalCsv } from "@/lib/tax-pack";
import { realisedByTaxYear } from "@/lib/tax-realised";

export const dynamic = "force-dynamic";

/** GET /api/tax/crypto/export?year=2027 — crypto disposals in NZ$. Same cent figures as the realised page. */
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
    const csv = cryptoDisposalCsv(realisedByTaxYear(await loadTaxRows(user._id), endingYear), (value) => {
      const shown = formatDisplayDate(value);
      return shown === "—" ? "" : shown;
    });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="crypto-disposals-${endingYear}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to export crypto disposals";
    console.error("[api/tax/crypto/export] GET error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
