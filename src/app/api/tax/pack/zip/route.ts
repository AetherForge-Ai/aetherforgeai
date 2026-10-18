import { CSV_LOCK_LABEL } from "@/lib/csv-lock-label";
import { NextResponse } from "next/server";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import { canExportCsv } from "@/lib/entitlements";
import { aucklandCivilToday, isNzTaxYearEnding, nzTaxYearEnding } from "@/lib/nz-tax-year";
import { getStableSessionUser } from "@/lib/session";
import { buildFullTaxPack } from "@/lib/tax-pack-build.server";
import { TAX_INDICATIVE_LABEL } from "@/lib/tax-disclaimer";
import { buildZip } from "@/lib/zip-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/tax/pack/zip?year=2027 — b29 H-9: the full pack in one download, built server-side from
 * the same data as the PDF: the PDF plus realised, dividends, FIF, income, positions, trades and
 * corporate-action CSVs.
 */
export async function GET(req: Request) {
  try {
    const user = await getStableSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) return accountMismatchResponse(user._id);
    if (!canExportCsv(user.subscription_plan)) {
      return NextResponse.json({ ok: false, error: `${CSV_LOCK_LABEL}.`, data: { code: "not_entitled" } }, { status: 403 });
    }
    const requested = Number(new URL(req.url).searchParams.get("year"));
    const endingYear = isNzTaxYearEnding(requested) ? requested : nzTaxYearEnding(aucklandCivilToday());
    if (endingYear == null) return NextResponse.json({ ok: false, error: "Tax year was not recognised." }, { status: 400 });
    const pack = await buildFullTaxPack(user._id, endingYear);
    const pdfBytes = new TextEncoder().encode(pack.pdf);
    const zip = buildZip([
      { name: `tax-pack-${endingYear}.pdf`, data: pdfBytes },
      { name: `realised-${endingYear}.csv`, data: pack.csvs.realised },
      { name: `dividends-${endingYear}.csv`, data: pack.csvs.dividends },
      { name: `fif-${endingYear}.csv`, data: pack.csvs.fif },
      { name: `income-${endingYear}.csv`, data: pack.csvs.income },
      { name: `positions-${endingYear}.csv`, data: pack.csvs.positions },
      { name: `trades-${endingYear}.csv`, data: pack.csvs.trades },
      { name: `corporate-actions-${endingYear}.csv`, data: pack.csvs.corporateActions },
      { name: "README.txt", data: `AetherForge NZ tax pack, tax year ending 31 March ${endingYear}.\n${TAX_INDICATIVE_LABEL}\nThe CSVs are built from the same ledger rows as the PDF.\n` },
    ]);
    return new NextResponse(zip as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="tax-pack-${endingYear}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/tax/pack/zip] GET error:", err instanceof Error ? err.message.slice(0, 120) : "error");
    return NextResponse.json({ ok: false, error: "The tax pack ZIP could not be built." }, { status: 500 });
  }
}
