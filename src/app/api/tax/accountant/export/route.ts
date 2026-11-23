import { NextResponse } from "next/server";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import {
  accountantPackFilename,
  buildAccountantPack,
  buildAccountantZip,
  resolveAccountantRange,
  rowsOwnedBy,
  type StoredPrice,
} from "@/lib/accountant-export";
import { loadAccountantLedger } from "@/lib/accountant-export.server";
import { aucklandCivilToday } from "@/lib/nz-tax-year";
import { getStableSessionUser } from "@/lib/session";
import { loadHoldingMarks } from "@/lib/tax-book-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/tax/accountant/export?year=2027&asOf=YYYY-MM-DD&from=YYYY-MM-DD&to=YYYY-MM-DD
 * ZIP of stored book figures for the signed-in account: holdings, transactions, dividends, README.
 * Read-only. No FIF or IR3 result. No Xero file. Share with accountant is future work.
 */
export async function GET(req: Request) {
  try {
    const user = await getStableSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) return accountMismatchResponse(user._id);
    const url = new URL(req.url);
    const resolved = resolveAccountantRange(
      {
        year: url.searchParams.get("year"),
        asOf: url.searchParams.get("asOf"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      },
      aucklandCivilToday()
    );
    if (resolved.ok === false) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 });
    }
    const [ledger, marks] = await Promise.all([loadAccountantLedger(user._id), loadHoldingMarks(user._id)]);
    const rows = rowsOwnedBy(ledger, user._id);
    const prices: StoredPrice[] = marks.map((mark) => ({
      ticker: mark.ticker,
      price: mark.currentPrice,
      asOf: mark.updatedAt,
      source: "Stored holding price",
    }));
    const generatedAt = new Date();
    const pack = buildAccountantPack({
      rows,
      marks: prices,
      range: resolved.range,
      generatedAt: generatedAt.toISOString(),
    });
    const zip = buildAccountantZip(pack, generatedAt);
    return new NextResponse(zip as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${accountantPackFilename(resolved.range.endingYear)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/tax/accountant/export] GET error:", err instanceof Error ? err.message.slice(0, 120) : "error");
    return NextResponse.json({ ok: false, error: "The accountant export could not be built." }, { status: 500 });
  }
}
