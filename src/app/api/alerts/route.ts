import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { referencePrice } from "@/lib/market";
import { fetchLiveQuotes, fetchCryptoLiveSnapshot } from "@/lib/market-data";
import { evaluateCryptoAlert } from "@/lib/crypto-live";
import { alertTickerKey, alertVisibleInBook, inferAlertAssetType, type DeskHolding } from "@/lib/alert-desk";
import { CRYPTO_DIRECTORY } from "@/lib/apex";
import { getMetalsSpot } from "@/lib/metals";

const createSchema = z.object({
  stockId: z.string().optional(),
  ticker: z.string().min(1).max(12),
  assetType: z.enum(["stock", "crypto", "metal"]).optional(),
  trimPct: z.number().nullable().optional(),
  trimTriggerDipPct: z.number().nullable().optional(),
  hardSellPrice: z.number().nullable().optional(),
  takeProfitMinPct: z.number().nullable().optional(),
  takeProfitMaxPct: z.number().nullable().optional(),
  instructions: z.string().optional(),
  status: z.enum(["active", "triggered", "paused", "archived"]).optional(),
});

const CRYPTO_TICKERS = new Set(CRYPTO_DIRECTORY.map((c) => c.ticker.toUpperCase()));

function stockLinkId(stock: unknown): string | null {
  if (typeof stock === "string" && stock) return stock;
  if (stock && typeof stock === "object" && "_id" in stock) {
    const id = (stock as { _id?: unknown })._id;
    return typeof id === "string" && id ? id : null;
  }
  return null;
}

/** GET /api/alerts — list the current user's price alerts (with live prices). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const res = await totalumSdk.crud.query("price_alert", {
      _filter: { user: user._id },
      _sort: { createdAt: "desc" },
      _limit: 200,
    });
    const storedRows = ((res?.data as any[]) || []).filter(
      (a) => String(a?.status || "active").toLowerCase() !== "archived"
    );

    // Classify tickers via stored asset_type + the user's holdings so crypto
    // alerts get Swyftx/CoinGecko prices (not Yahoo equity quotes).
    // A failed holdings read must not look like an empty book — that dropped
    // every alert and the desk stayed on "No alerts yet" after Create.
    let book: DeskHolding[] | null = null;
    const holdingTypeByTicker = new Map<string, string>();
    const purchaseByTicker = new Map<string, number>();
    try {
      const holdingsRes = await totalumSdk.crud.query("stock", {
        _filter: { user: user._id },
        _limit: 500,
      });
      book = [];
      for (const h of ((holdingsRes as any)?.data as any[]) || []) {
        const t = String(h.ticker || "").toUpperCase();
        if (!t) continue;
        const key = alertTickerKey(t);
        holdingTypeByTicker.set(key, h.asset_type || "stock");
        const shares = Number(h.shares ?? h.quantity) || 0;
        book.push({ _id: h._id ? String(h._id) : null, ticker: t, shares, asset_type: h.asset_type });
        const px = Number(h.purchase_price);
        if (px > 0) purchaseByTicker.set(key, px);
      }
      try {
        const precious = await totalumSdk.crud.query("precious_metal", {
          _filter: { user: user._id },
          _limit: 200,
        });
        for (const m of ((precious as any)?.data as any[]) || []) {
          const metal = String(m.metal || "").toLowerCase();
          const ticker = metal === "silver" ? "SILVER" : "GOLD";
          const ounces = Number(m.ounces) || 0;
          book.push({
            _id: m._id ? String(m._id) : null,
            ticker,
            shares: ounces,
            asset_type: "metal",
          });
          holdingTypeByTicker.set(alertTickerKey(ticker), "metal");
        }
      } catch (err) {
        console.error("[api/alerts] precious metal holdings lookup failed:", err);
      }
    } catch (err) {
      console.error("[api/alerts] holdings lookup failed:", err);
      book = null;
    }
    // Archived rows are already dropped. A flat row, or a holding deleted on a
    // full sell, leaves Watching. A follow alert with no position still lists.
    const rows = storedRows.filter((a) =>
      alertVisibleInBook(
        {
          ticker: String(a.ticker || ""),
          status: a.status,
          stockId: stockLinkId(a.stock),
        },
        book
      )
    );

    const classified = rows.map((a) => {
      const ticker = String(a.ticker || "").toUpperCase();
      const assetType = inferAlertAssetType(
        ticker,
        a.asset_type,
        holdingTypeByTicker.get(alertTickerKey(ticker)),
        CRYPTO_TICKERS
      );
      return { a, ticker, assetType };
    });

    const equityTickers = classified.filter((c) => c.assetType === "stock").map((c) => c.ticker);
    const cryptoTickers = classified.filter((c) => c.assetType === "crypto").map((c) => c.ticker);

    const [liveEquity, liveCrypto] = await Promise.all([
      equityTickers.length
        ? fetchLiveQuotes(equityTickers).catch((err) => {
            console.error("[api/alerts] equity quote fetch failed:", err);
            return {} as Record<string, { price: number; changePct: number }>;
          })
        : Promise.resolve({} as Record<string, { price: number; changePct: number }>),
      cryptoTickers.length
        ? fetchCryptoLiveSnapshot(cryptoTickers).catch((err) => {
            console.error("[api/alerts] crypto quote fetch failed:", err);
            return { quotes: {} as Record<string, { price: number; changePct: number }>, updatedAt: "", live: true as const };
          })
        : Promise.resolve({ quotes: {} as Record<string, { price: number; changePct: number }>, updatedAt: "", live: true as const }),
    ]);

    const metalTickers = classified.filter((c) => c.assetType === "metal").map((c) => c.ticker);
    let metalSpot: { gold?: { nzdPerOz: number }; silver?: { nzdPerOz: number } } | null = null;
    if (metalTickers.length) {
      try {
        metalSpot = await getMetalsSpot();
      } catch (err) {
        console.error("[api/alerts] metals spot fetch failed:", err);
      }
    }

    const alerts = classified.map(({ a, ticker, assetType }) => {
      let currentPrice = 0;
      if (assetType === "metal") {
        const key = ticker === "SILVER" ? "silver" : "gold";
        currentPrice = metalSpot?.[key]?.nzdPerOz || 0;
      } else {
        const liveHit = assetType === "crypto" ? liveCrypto.quotes[ticker] : liveEquity[ticker];
        currentPrice =
          liveHit && liveHit.price > 0
            ? liveHit.price
            : referencePrice(a.ticker, Number(a.hard_sell_price) || 1);
      }
      if (!(currentPrice > 0)) {
        currentPrice = referencePrice(a.ticker, Number(a.hard_sell_price) || 1);
      }
      // Equities keep the absolute hard-sell check. Crypto also evaluates the
      // member's configured % vs purchase (sell at a loss, trim in the gain
      // band) against the live 24/7 mark. Thresholds are not rewritten.
      const purchasePrice = assetType === "crypto" ? purchaseByTicker.get(alertTickerKey(ticker)) ?? null : null;
      const cryptoEval =
        assetType === "crypto"
          ? evaluateCryptoAlert({
              purchasePrice,
              currentPrice,
              trimTriggerDipPct: a.trim_trigger_dip_pct ?? null,
              hardSellPrice: a.hard_sell_price ?? null,
              takeProfitMinPct: a.take_profit_min_pct ?? null,
              takeProfitMaxPct: a.take_profit_max_pct ?? null,
            })
          : null;
      const triggered =
        cryptoEval?.sell ??
        (typeof a.hard_sell_price === "number" && a.hard_sell_price > 0 && currentPrice <= a.hard_sell_price);
      return {
        _id: a._id,
        ticker: a.ticker,
        stockId: typeof a.stock === "string" ? a.stock : a.stock?._id ?? null,
        assetType,
        trimPct: a.trim_pct ?? null,
        trimTriggerDipPct: a.trim_trigger_dip_pct ?? null,
        hardSellPrice: a.hard_sell_price ?? null,
        takeProfitMinPct: a.take_profit_min_pct ?? null,
        takeProfitMaxPct: a.take_profit_max_pct ?? null,
        instructions: a.instructions ?? "",
        status: a.status ?? "active",
        currentPrice,
        purchasePrice,
        pnlPct: cryptoEval?.pnlPct ?? null,
        trimming: cryptoEval?.trimming ?? false,
        triggered,
      };
    });

    console.log(`[api/alerts] GET returned ${alerts.length} alerts for user ${user._id}`);
    return NextResponse.json({ ok: true, data: alerts });
  } catch (err: any) {
    console.error("[api/alerts] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load alerts" }, { status: 500 });
  }
}

/** POST /api/alerts — create a price alert for a holding. */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    const record: Record<string, unknown> = {
      user: user._id,
      ticker: d.ticker.trim().toUpperCase(),
      asset_type: d.assetType || "stock",
      trim_pct: d.trimPct ?? null,
      trim_trigger_dip_pct: d.trimTriggerDipPct ?? null,
      hard_sell_price: d.hardSellPrice ?? null,
      take_profit_min_pct: d.takeProfitMinPct ?? null,
      take_profit_max_pct: d.takeProfitMaxPct ?? null,
      instructions: d.instructions?.trim() || "",
      status: d.status || "active",
    };
    if (d.stockId) record.stock = d.stockId;

    let saved;
    try {
      saved = await totalumSdk.crud.createRecord("price_alert", record);
    } catch (err: any) {
      // Older Totalum schemas may not have asset_type yet — persist without it.
      console.warn("[api/alerts] create with asset_type failed, retrying without:", err?.message || err);
      const { asset_type: _drop, ...rest } = record;
      saved = await totalumSdk.crud.createRecord("price_alert", rest);
    }
    console.log(`[api/alerts] Created alert for ${record.ticker} (${record.asset_type}) user ${user._id}`);
    return NextResponse.json({
      ok: true,
      data: { ...(saved?.data ?? record), assetType: d.assetType || "stock" },
    });
  } catch (err: any) {
    console.error("[api/alerts] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to create alert" }, { status: 500 });
  }
}
