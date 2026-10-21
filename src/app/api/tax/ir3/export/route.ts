import { CSV_LOCK_LABEL } from "@/lib/csv-lock-label";
import { NextResponse } from "next/server";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import { canExportCsv } from "@/lib/entitlements";
import { aucklandCivilToday, isNzTaxYearEnding, nzTaxYearEnding } from "@/lib/nz-tax-year";
import { getStableSessionUser } from "@/lib/session";
import { buildFullTaxPack } from "@/lib/tax-pack-build.server";

export const dynamic = "force-dynamic";

/** GET /api/tax/ir3/export?year=2026 — G-31 IR3 helper CSV, same build as the tax pack PDF/ZIP. */
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
    return new NextResponse(pack.csvs.ir3, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ir3-helper-${endingYear}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/tax/ir3/export] GET error:", err instanceof Error ? err.message.slice(0, 120) : "error");
    return NextResponse.json({ ok: false, error: "The IR3 helper could not be built." }, { status: 500 });
  }
}
