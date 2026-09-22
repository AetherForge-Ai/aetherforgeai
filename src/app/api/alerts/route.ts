import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { referencePrice } from "@/lib/market";
import { fetchLiveQuotes, fetchCryptoQuotes } from "@/lib/market-data";
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
  status: z.enum(["active", "triggered", "paused"]).optional(),
});

const CRYPTO_TICKERS = new Set(CRYPTO_DIRECTORY.map((c) => c.ticker.toUpperCase()));

function inferAssetType(
  ticker: string,
  stored: string | null | undefined,
  holdingType: string | null | undefined
): "stock" | "crypto" | "metal" {
  const s = (stored || "").toLowerCase();
  if (s === "crypto" || s === "stock" || s === "metal") return s as "stock" | "crypto" | "metal";
  const h = (holdingType || "").toLowerCase();
  if (h === "crypto" || h === "stock" || h === "metal") return h as "stock" | "crypto" | "metal";
  const t = ticker.toUpperCase();
  if (t === "GOLD" || t === "SILVER") return "metal";
  if (CRYPTO_TICKERS.has(t) || CRYPTO_TICKERS.has(t.replace(/-USD$/, ""))) return "crypto";
  return "stock";
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
    const rows = (res?.data as any[]) || [];

    // Classify tickers via stored asset_type + the user's holdings so crypto
    // alerts get Swyftx/CoinGecko prices (not Yahoo equity quotes).
    const holdingsRes = await totalumSdk.crud
      .query("stock", { _filter: { user: user._id }, _limit: 500 })
      .catch(() => null);
    const holdingTypeByTicker = new Map<string, string>();
    for (const h of ((holdingsRes as any)?.data as any[]) || []) {
      const t = String(h.ticker || "").toUpperCase();
      if (t) holdingTypeByTicker.set(t, h.asset_type || "stock");
    }

    const classified = rows.map((a) => {
      const ticker = String(a.ticker || "").toUpperCase();
      const assetType = inferAssetType(ticker, a.asset_type, holdingTypeByTicker.get(ticker));
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
        ? fetchCryptoQuotes(cryptoTickers).catch((err) => {
            console.error("[api/alerts] crypto quote fetch failed:", err);
            return {} as Record<string, { price: number; changePct: number }>;
          })
        : Promise.resolve({} as Record<string, { price: number; changePct: number }>),
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
        const liveHit = assetType === "crypto" ? liveCrypto[ticker] : liveEquity[ticker];
        currentPrice =
          liveHit && liveHit.price > 0
            ? liveHit.price
            : referencePrice(a.ticker, Number(a.hard_sell_price) || 1);
      }
      if (!(currentPrice > 0)) {
        currentPrice = referencePrice(a.ticker, Number(a.hard_sell_price) || 1);
      }
      const triggered =
        typeof a.hard_sell_price === "number" && a.hard_sell_price > 0 && currentPrice <= a.hard_sell_price;
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
