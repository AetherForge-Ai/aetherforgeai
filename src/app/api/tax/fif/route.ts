import { NextResponse } from "next/server";
import { z } from "zod";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse } from "@/lib/account-response";
import { invalidateBookCache } from "@/lib/book-cache";
import { stockForTicker, withFifMarketNotes } from "@/lib/fif-working-paper";
import { isNzTaxYearEnding } from "@/lib/nz-tax-year";
import { getStableSessionUser } from "@/lib/session";
import { loadStockNoteRows } from "@/lib/tax-book-server";
import { totalumSdk } from "@/lib/totalum";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ticker: z.string().trim().min(1).max(16),
  year: z.number().int(),
  opening: z.number().min(0).max(1_000_000_000).nullable(),
  closing: z.number().min(0).max(1_000_000_000).nullable(),
});

/** POST /api/tax/fif — store opening and closing market values in stock.notes. */
export async function POST(req: Request) {
  try {
    const user = await getStableSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      return accountMismatchResponse(user._id);
    }
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success || !isNzTaxYearEnding(parsed.data?.year)) {
      return NextResponse.json({ ok: false, error: "Market value was not recognised." }, { status: 400 });
    }
    const { ticker, year, opening, closing } = parsed.data;
    const owned = stockForTicker(await loadStockNoteRows(user._id), ticker);
    if (!owned) {
      return NextResponse.json({ ok: false, error: "Holding not found" }, { status: 404 });
    }
    const notes = withFifMarketNotes(owned.notes, year, opening, closing);
    await totalumSdk.crud.editRecordById("stock", owned.id, { notes });
    invalidateBookCache(user._id);
    return NextResponse.json({ ok: true, data: { ticker: owned.ticker, year } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save market value";
    console.error("[api/tax/fif] POST error:", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
