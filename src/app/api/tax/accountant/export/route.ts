import { CSV_LOCK_LABEL } from "@/lib/csv-lock-label";
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
import { canExportCsv } from "@/lib/entitlements";
import { aucklandCivilToday } from "@/lib/nz-tax-year";
import { getStableSessionUser } from "@/lib/session";
import { loadHoldingMarks } from "@/lib/tax-book-server";

export const dynamic = "force-dynamic";

const PRIVATE_CACHE = { "Cache-Control": "private, no-store" };

function friendlyDateError(message: string) {
  const safe = message.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] || ch);
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Export dates</title><p>${safe} Go back to the Tax page and choose the dates again.</p><p><a href="/tax">Back to Tax</a></p></html>`;
  return new NextResponse(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8", ...PRIVATE_CACHE },
  });
}

/**
 * GET /api/tax/accountant/export?year=2027&asOf=YYYY-MM-DD&from=YYYY-MM-DD&to=YYYY-MM-DD
 * ZIP of stored book figures for the signed-in paid account.
 * A ?userId query is ignored. Read-only. No FIF or IR3 result. No Xero file.
 * Share with accountant is future work.
 */
export async function GET(req: Request) {
  try {
    const user = await getStableSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: PRIVATE_CACHE });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) return accountMismatchResponse(user._id);
    if (!canExportCsv(user.subscription_plan)) {
      return NextResponse.json(
        { ok: false, error: `${CSV_LOCK_LABEL}.`, data: { code: "not_entitled" } },
        { status: 403, headers: PRIVATE_CACHE }
      );
    }
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
    if (resolved.ok === false) return friendlyDateError(resolved.error);
    const [ledger, marks] = await Promise.all([loadAccountantLedger(user._id), loadHoldingMarks(user._id)]);
    const rows = rowsOwnedBy(ledger.rows, user._id);
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
      rowsRead: ledger.rows.length,
      incomplete: ledger.truncated,
    });
    const zip = buildAccountantZip(pack, generatedAt);
    return new NextResponse(zip as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${accountantPackFilename(resolved.range.endingYear)}"`,
        ...PRIVATE_CACHE,
        "X-Export-Truncated": ledger.truncated ? "1" : "0",
      },
    });
  } catch (err) {
    console.error("[api/tax/accountant/export] GET error:", err instanceof Error ? err.message.slice(0, 120) : "error");
    return NextResponse.json({ ok: false, error: "The accountant export could not be built." }, { status: 500, headers: PRIVATE_CACHE });
  }
}
