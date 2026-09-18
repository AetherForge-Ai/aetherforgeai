import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { checkFillSanity, ADVISORY_NOTE } from "@/lib/fill-integrity";
import { fetchCryptoQuotes, fetchLivePrice, isLiveDataConfigured } from "@/lib/market-data";
import { logLedgerAudit, appendAuditNote } from "@/lib/ledger-audit";
import { totalumSdk } from "@/lib/totalum";
import { normalizeTicker, lookupTicker } from "@/lib/market";

const updateSchema = z.object({
  ticker: z.string().min(1).max(12).optional(),
  asset_type: z.enum(["stock", "crypto"]).optional(),
  shares: z.number().positive().optional(),
  purchase_price: z.number().positive().optional(),
  purchase_date: z.string().optional(),
  current_price: z.number().positive().optional(),
  company_name: z.string().optional(),
  sector: z.string().optional(),
  soft_override_confirmed: z.boolean().optional(),
  typed_live_override: z.string().optional(),
  cash_or_notional: z.number().optional(),
  price_source: z.enum(["user_fill", "broker_import", "session_close", "live_quote", "bot_signal"]).optional(),
  notes: z.string().max(2000).optional(),
});

// Verify the holding exists AND belongs to the current user.
async function loadOwnedStock(id: string, userId: string) {
  const res = await totalumSdk.crud.getRecordById("stock", id);
  const record = (res as any)?.data;
  if (!record) return null;
  const ownerId =
    typeof record.user === "object" && record.user !== null ? record.user._id : record.user;
  if (String(ownerId) !== String(userId)) return null;
  return record;
}

// PUT /api/stocks/[id] — edit a holding
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const owned = await loadOwnedStock(id, user._id);
    if (!owned) {
      return NextResponse.json({ ok: false, error: "Holding not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const patch: Record<string, unknown> = { ...parsed.data };
    delete patch.soft_override_confirmed;
    delete patch.typed_live_override;
    delete patch.cash_or_notional;
    if (parsed.data.ticker) {
      const ticker = normalizeTicker(parsed.data.ticker);
      patch.ticker = ticker;
      const info = lookupTicker(ticker);
      if (info && !parsed.data.company_name) patch.company_name = info.name;
      if (info && !parsed.data.sector) patch.sector = info.sector;
    }

    const ticker = String(patch.ticker || owned.ticker);
    const assetType = (patch.asset_type || owned.asset_type || "stock") as "stock" | "crypto";
    const qty = Number(patch.shares ?? owned.shares);
    const fill = Number(patch.purchase_price ?? owned.purchase_price);
    let liveSpot: number | null = null;
    try {
      if (assetType === "crypto") {
        const q = await fetchCryptoQuotes([ticker]);
        liveSpot = q[ticker.toUpperCase()]?.price ?? null;
      } else if (isLiveDataConfigured()) {
        liveSpot = (await fetchLivePrice(ticker)) || null;
      }
    } catch {}
    if (parsed.data.shares != null || parsed.data.purchase_price != null) {
      const sanity = checkFillSanity({
        ticker,
        quantity: qty,
        fillPrice: fill,
        liveSpot,
        cashOrNotional: parsed.data.cash_or_notional,
        assetType,
        typedLiveOverride: parsed.data.typed_live_override,
        softOverrideConfirmed: !!parsed.data.soft_override_confirmed,
        priceSource: parsed.data.price_source || "user_fill",
        tradeDate: parsed.data.purchase_date || owned.purchase_date,
      });
      if (sanity.blocked) {
        return NextResponse.json({ ok: false, error: sanity.message, data: { code: sanity.code } }, { status: 400 });
      }
      patch.fill_price = fill;
      if (liveSpot) patch.mark_price = liveSpot;
      patch.notes = appendAuditNote(
        String(parsed.data.notes || owned.notes || ""),
        `Edited fill/qty. ${ADVISORY_NOTE}`
      );
      logLedgerAudit({
        action: "holding_edit",
        ticker,
        userId: user._id,
        before: { shares: owned.shares, purchase_price: owned.purchase_price },
        after: { shares: qty, purchase_price: fill },
      });
    }

    await totalumSdk.crud.editRecordById("stock", id, patch);
    console.log(`[api/stocks/${id}] PUT updated for user ${user._id}`);

    return NextResponse.json({ ok: true, data: { _id: id, ...patch } });
  } catch (err: any) {
    console.error("[api/stocks/[id]] PUT error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to update stock" }, { status: 500 });
  }
}

// DELETE /api/stocks/[id] — remove a holding
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const owned = await loadOwnedStock(id, user._id);
    if (!owned) {
      return NextResponse.json({ ok: false, error: "Holding not found" }, { status: 404 });
    }

    await totalumSdk.crud.deleteRecordById("stock", id);
    console.log(`[api/stocks/${id}] DELETE for user ${user._id}`);

    return NextResponse.json({ ok: true, data: { _id: id } });
  } catch (err: any) {
    console.error("[api/stocks/[id]] DELETE error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to delete stock" }, { status: 500 });
  }
}
