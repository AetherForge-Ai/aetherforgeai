import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { lookupTicker, normalizeTicker, referencePrice } from "@/lib/market";
import { seedStarterPortfolioIfNeeded } from "@/lib/seed";
import { fetchLivePrice, isLiveDataConfigured, fetchCryptoQuotes } from "@/lib/market-data";
import { checkTickerQuota } from "@/lib/entitlements";

const createSchema = z.object({
  ticker: z.string().min(1, "Ticker is required").max(12),
  asset_type: z.enum(["stock", "crypto"]).optional(),
  shares: z.number().positive("Shares must be greater than 0"),
  purchase_price: z.number().positive("Purchase price must be greater than 0"),
  company_name: z.string().optional(),
  sector: z.string().optional(),
});

// GET /api/stocks?asset_type=stock|crypto — list the current user's holdings
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // First-visit onboarding: seed a starter portfolio so the dashboard
    // isn't empty. Guarded by the user's `onboarded` flag.
    const seeded = await seedStarterPortfolioIfNeeded(user._id);

    const assetType = new URL(req.url).searchParams.get("asset_type");

    const result = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _sort: { createdAt: "desc" },
      _limit: 500,
    });

    let stocks = (result?.data as any[]) || [];
    // Legacy rows without asset_type are treated as stock.
    if (assetType === "stock" || assetType === "crypto") {
      stocks = stocks.filter((s) => (s.asset_type || "stock") === assetType);
    }
    if (seeded) {
      console.log(`[api/stocks] Seeded starter portfolio; now ${stocks.length} holdings`);
    }
    console.log(
      `[api/stocks] GET returned ${stocks.length} holdings for user ${user._id} (filter: ${assetType || "all"})`
    );

    return NextResponse.json({ ok: true, data: stocks });
  } catch (err: any) {
    console.error("[api/stocks] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load stocks" }, { status: 500 });
  }
}

// POST /api/stocks — add a holding
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const ticker = normalizeTicker(parsed.data.ticker);
    const assetType = parsed.data.asset_type || "stock";
    const info = lookupTicker(ticker);
    const purchase_price = parsed.data.purchase_price;

    // Enforce the plan's ticker quota (FREE = 3 across both bots; paid = per bot).
    // Never trust the client — this is the authoritative gate, so a free member
    // cannot add unlimited holdings by calling the API directly.
    const existing = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _limit: 1000,
    });
    const held = (existing?.data as any[]) || [];
    const quota = checkTickerQuota(user, held, assetType);
    if (!quota.allowed) {
      console.log(
        `[api/stocks] Quota reached for user ${user._id}: ${quota.used}/${quota.limit} (${quota.scope}) — blocking add of ${ticker}`
      );
      return NextResponse.json(
        {
          ok: false,
          error: quota.message,
          data: { code: "ticker_limit", used: quota.used, limit: quota.limit, scope: quota.scope },
        },
        { status: 403 }
      );
    }

    // Prefer a live quote when available; else use the curated reference price.
    // Crypto uses CoinGecko (no key); stocks use Twelve Data (needs a key).
    // Never fatal — falls back on any error.
    let current_price = referencePrice(ticker, purchase_price);
    try {
      if (assetType === "crypto") {
        const quotes = await fetchCryptoQuotes([ticker]);
        const live = quotes[ticker.toUpperCase()]?.price;
        if (live && live > 0) current_price = live;
      } else if (isLiveDataConfigured()) {
        const livePrice = await fetchLivePrice(ticker);
        if (livePrice && livePrice > 0) current_price = livePrice;
      }
    } catch (err) {
      console.error(`[api/stocks] Live price lookup failed for ${ticker} (non-fatal):`, err);
    }

    const record = {
      ticker,
      asset_type: parsed.data.asset_type || "stock",
      company_name: parsed.data.company_name || info?.name || ticker,
      sector: parsed.data.sector || info?.sector || (parsed.data.asset_type === "crypto" ? "Digital Assets" : "Other"),
      shares: parsed.data.shares,
      purchase_price,
      current_price,
      user: user._id,
    };

    const result = await totalumSdk.crud.createRecord("stock", record);
    console.log(`[api/stocks] POST created holding ${ticker} for user ${user._id}`);

    return NextResponse.json({ ok: true, data: result?.data ?? record });
  } catch (err: any) {
    console.error("[api/stocks] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to add stock" }, { status: 500 });
  }
}
