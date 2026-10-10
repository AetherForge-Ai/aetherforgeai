import { NextResponse } from "next/server";
import { dividendCsv, dividendViewFromRow } from "@/lib/dividend-ledger";
import { formatDisplayDate } from "@/lib/currency";
import { canExportCsv } from "@/lib/entitlements";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import { getStableSessionUser } from "@/lib/session";
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
        { ok: false, error: "CSV export is included on Starter and above.", data: { code: "not_entitled" } },
        { status: 403 }
      );
    }
    const rows = (await loadDividendRows(user._id)).map(dividendViewFromRow);
    const csv = dividendCsv(rows, (value) => {
      const shown = formatDisplayDate(value);
      return shown === "—" ? "" : shown;
    });
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="dividend-ledger.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to export the dividend ledger";
    console.error("[api/tax/dividends/export] GET error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
