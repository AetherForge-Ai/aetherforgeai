/**
 * GET  /api/ledger/repair — flag bad holdings (crypto 3×, prior-close equities, known examples)
 * POST /api/ledger/repair — apply user-confirmed qty/price repair; NEVER changes cash_nzd
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { fetchCryptoQuotes, fetchLivePrice, isLiveDataConfigured } from "@/lib/market-data";
import {
  flagHolding,
  KNOWN_BAD_EXAMPLES,
  buildRepairNotes,
  type RepairFlag,
} from "@/lib/ledger-repair";
import { checkFillSanity } from "@/lib/fill-integrity";
import { logLedgerAudit } from "@/lib/ledger-audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const result = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _limit: 1000,
    });
    const holdings = (result?.data as any[]) || [];

    const cryptoTickers = holdings
      .filter((h) => (h.asset_type || "stock") === "crypto")
      .map((h) => String(h.ticker));
    const equityTickers = holdings
      .filter((h) => (h.asset_type || "stock") !== "crypto")
      .map((h) => String(h.ticker));

    const [cq, /* eq skipped batch for speed */] = await Promise.all([
      cryptoTickers.length ? fetchCryptoQuotes(cryptoTickers) : Promise.resolve({}),
      Promise.resolve({}),
    ]);

    const flags: RepairFlag[] = [];
    for (const h of holdings) {
      const t = String(h.ticker).toUpperCase();
      const asset = h.asset_type || "stock";
      let live = Number(h.current_price) || 0;
      if (asset === "crypto" && cq[t]?.price) live = cq[t].price;
      else if (asset !== "crypto" && isLiveDataConfigured()) {
        try {
          const lp = await fetchLivePrice(t);
          if (lp) live = lp;
        } catch {}
      }
      const flag = flagHolding({
        _id: h._id,
        ticker: t,
        asset_type: asset,
        shares: Number(h.shares),
        purchase_price: Number(h.purchase_price),
        current_price: live,
        cash_nzd: h.cash_nzd ?? null,
        purchase_date: h.purchase_date,
        notes: h.notes,
        prior_close: h.prior_close,
        session_close_date: h.session_close_date,
      });
      if (flag) flags.push(flag);
    }

    // Always include known bad examples as reference cards (not auto-applied)
    const examples = KNOWN_BAD_EXAMPLES.map((ex, i) => {
      const prop = {
        new_qty: Math.abs(ex.quantity * ex.fill_price) / ex.approx_live,
        new_price: ex.approx_live,
        note: ex.note + " — cash_nzd untouched.",
      };
      return {
        id: `example-${ex.ticker}-${i}`,
        kind: "known_bad_example" as const,
        ticker: ex.ticker,
        asset_type: ex.asset_type,
        quantity: ex.quantity,
        fill_price: ex.fill_price,
        live_spot: ex.approx_live,
        ratio: ex.fill_price / ex.approx_live,
        cash_nzd: null,
        trade_date: ex.trade_date,
        message: ex.note,
        proposal: prop,
        originals: { quantity: ex.quantity, fill_price: ex.fill_price },
      };
    });

    return NextResponse.json({
      ok: true,
      data: { flags, known_examples: examples, cash_policy: "cash_nzd is NEVER auto-changed" },
    });
  } catch (err: any) {
    console.error("[api/ledger/repair] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Repair scan failed" }, { status: 500 });
  }
}

const applySchema = z.object({
  holding_id: z.string().min(1),
  new_qty: z.number().positive(),
  new_price: z.number().positive(),
  typed_live_override: z.string().optional(),
  soft_override_confirmed: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const res = await totalumSdk.crud.getRecordById("stock", parsed.data.holding_id);
    const owned = (res as any)?.data;
    if (!owned) return NextResponse.json({ ok: false, error: "Holding not found" }, { status: 404 });
    const ownerId = typeof owned.user === "object" ? owned.user?._id : owned.user;
    if (String(ownerId) !== String(user._id)) {
      return NextResponse.json({ ok: false, error: "Holding not found" }, { status: 404 });
    }

    const ticker = String(owned.ticker).toUpperCase();
    const assetType = (owned.asset_type || "stock") as "stock" | "crypto";
    let liveSpot: number | null = null;
    if (assetType === "crypto") {
      const q = await fetchCryptoQuotes([ticker]);
      liveSpot = q[ticker]?.price ?? parsed.data.new_price;
    } else {
      liveSpot = parsed.data.new_price;
    }

    const sanity = checkFillSanity({
      ticker,
      quantity: parsed.data.new_qty,
      fillPrice: parsed.data.new_price,
      liveSpot,
      assetType,
      typedLiveOverride: parsed.data.typed_live_override,
      softOverrideConfirmed: !!parsed.data.soft_override_confirmed,
      priceSource: "user_fill",
    });
    if (sanity.blocked) {
      return NextResponse.json({ ok: false, error: sanity.message }, { status: 400 });
    }

    const flag: RepairFlag = {
      id: owned._id,
      kind: "crypto_extreme",
      ticker,
      asset_type: assetType,
      quantity: Number(owned.shares),
      fill_price: Number(owned.purchase_price),
      live_spot: liveSpot,
      ratio: null,
      cash_nzd: owned.cash_nzd ?? null,
      message: "User-confirmed repair",
      originals: {
        quantity: Number(owned.shares),
        fill_price: Number(owned.purchase_price),
        notes: owned.notes,
      },
    };

    const notes = buildRepairNotes(flag, {
      new_qty: parsed.data.new_qty,
      new_price: parsed.data.new_price,
    });

    // CRITICAL: do not touch cash_nzd / user.cash_balance
    await totalumSdk.crud.editRecordById("stock", owned._id, {
      shares: parsed.data.new_qty,
      purchase_price: parsed.data.new_price,
      fill_price: parsed.data.new_price,
      current_price: liveSpot || parsed.data.new_price,
      mark_price: liveSpot || parsed.data.new_price,
      notes,
    });

    logLedgerAudit({
      action: "repair_applied",
      ticker,
      userId: user._id,
      before: { shares: owned.shares, purchase_price: owned.purchase_price, cash_nzd: owned.cash_nzd },
      after: {
        shares: parsed.data.new_qty,
        purchase_price: parsed.data.new_price,
        cash_nzd: owned.cash_nzd,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        holding_id: owned._id,
        new_qty: parsed.data.new_qty,
        new_price: parsed.data.new_price,
        cash_nzd_untouched: true,
        notes,
      },
    });
  } catch (err: any) {
    console.error("[api/ledger/repair] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Repair apply failed" }, { status: 500 });
  }
}
