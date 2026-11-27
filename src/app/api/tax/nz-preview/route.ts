import { NextResponse } from "next/server";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse, privateJson } from "@/lib/account-response";
import { nzTaxPreviewEnabled } from "@/lib/feature-flags";
import { marketsFromNotes } from "@/lib/fif-working-paper";
import { readFifThreshold } from "@/lib/fif-setting.server";
import {
  NZ_TAX_PREVIEW_DISCLAIMER,
  defaultSalePrice,
  defaultSaleQuantity,
  previewNzTaxSale,
  resolvePreviewDate,
} from "@/lib/nz-tax-preview";
import { getStableSessionUser } from "@/lib/session";
import { loadStockNoteRows, loadTaxRows, loadYieldHoldings } from "@/lib/tax-book-server";
import { previewableHoldings } from "@/lib/tax-sale-preview";

export const dynamic = "force-dynamic";

function hidden() {
  return NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

/** GET /api/tax/nz-preview — read-only FIF sale estimate. 404 while NZ_TAX_PREVIEW is off. */
export async function GET(req: Request) {
  if (!nzTaxPreviewEnabled()) return hidden();
  try {
    const user = await getStableSessionUser();
    if (!user) return hidden();
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) return accountMismatchResponse(user._id);

    const url = new URL(req.url);
    const resolved = resolvePreviewDate({ date: url.searchParams.get("date"), year: url.searchParams.get("year") });
    if (resolved.ok === false) {
      return privateJson({ ok: false, disclaimer: NZ_TAX_PREVIEW_DISCLAIMER, error: resolved.error }, 400);
    }
    const { date, endingYear } = resolved;

    const [rows, stocks, yields, thresholdNzd] = await Promise.all([
      loadTaxRows(user._id),
      loadStockNoteRows(user._id),
      loadYieldHoldings(user._id),
      readFifThreshold(user._id),
    ]);
    const ticker = String(url.searchParams.get("ticker") || "").trim().toUpperCase();
    const holdings = previewableHoldings(rows);
    const selected = holdings.find((holding) => holding.ticker === ticker) ?? null;
    const current = yields.find((row) => row.ticker.trim().toUpperCase() === ticker)?.currentPrice ?? null;
    const quantity = defaultSaleQuantity(selected?.quantity ?? null, url.searchParams.get("qty"));
    const price = defaultSalePrice(current, url.searchParams.get("price"));
    if (quantity == null || price == null) {
      return privateJson(
        { ok: false, disclaimer: NZ_TAX_PREVIEW_DISCLAIMER, error: "Enter a quantity and a sale price." },
        400,
      );
    }
    const preview = previewNzTaxSale({
      rows,
      markets: marketsFromNotes(stocks, endingYear),
      sale: { ticker, quantity, price, date },
      thresholdNzd,
    });
    if (preview.ok === false) return privateJson({ ok: false, disclaimer: NZ_TAX_PREVIEW_DISCLAIMER, error: preview.error }, 400);
    return privateJson({ ok: true, disclaimer: NZ_TAX_PREVIEW_DISCLAIMER, data: preview });
  } catch (err: unknown) {
    console.error("[api/tax/nz-preview] GET error:", err instanceof Error ? err.message.slice(0, 120) : "error");
    return NextResponse.json({ ok: false, error: "The preview could not be read." }, { status: 500 });
  }
}
