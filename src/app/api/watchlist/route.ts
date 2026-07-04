import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { normalizeTicker, lookupTicker } from "@/lib/market";

const createSchema = z.object({
  ticker: z.string().min(1, "Ticker is required").max(16),
  asset_type: z.enum(["stock", "crypto"]).optional(),
  name: z.string().optional(),
  market: z.string().optional(),
});

/**
 * GET /api/watchlist?asset_type=stock|crypto
 * Returns the current user's watchlist items (tickers they track but may not
 * own). Optionally scoped to a single asset class for the active bot.
 */
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const assetType = new URL(req.url).searchParams.get("asset_type");

    const result = await totalumSdk.crud.query("watchlist", {
      _filter: { user: user._id },
      _sort: { createdAt: "desc" },
      _limit: 500,
    });

    let items = (result?.data as any[]) || [];
    if (assetType === "stock" || assetType === "crypto") {
      items = items.filter((w) => (w.asset_type || "stock") === assetType);
    }

    console.log(
      `[api/watchlist] GET returned ${items.length} items for user ${user._id} (filter: ${assetType || "all"})`
    );
    return NextResponse.json({ ok: true, data: items });
  } catch (err: any) {
    console.error("[api/watchlist] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load watchlist" }, { status: 500 });
  }
}

/**
 * POST /api/watchlist — add a ticker/crypto to the watchlist.
 * De-duplicates on (user, ticker, asset_type) so a symbol can't be added twice.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const assetType = parsed.data.asset_type || "stock";
    const ticker = assetType === "crypto" ? parsed.data.ticker.toUpperCase() : normalizeTicker(parsed.data.ticker);
    const info = assetType === "crypto" ? undefined : lookupTicker(ticker);
    // Derive the market from the ticker suffix (crypto → CRYPTO, .NZ → NZX, .AX → ASX, else US).
    const market =
      parsed.data.market ||
      (assetType === "crypto"
        ? "CRYPTO"
        : ticker.endsWith(".NZ")
          ? "NZX"
          : ticker.endsWith(".AX")
            ? "ASX"
            : "US");

    // Guard against duplicates for this user + asset class.
    const existing = await totalumSdk.crud.query("watchlist", {
      _filter: { user: user._id, ticker, asset_type: assetType },
      _limit: 1,
    });
    if (((existing?.data as any[]) || []).length) {
      console.log(`[api/watchlist] ${ticker} already tracked by user ${user._id}`);
      return NextResponse.json({ ok: true, data: (existing!.data as any[])[0] });
    }

    const record = {
      ticker,
      name: parsed.data.name || info?.name || ticker,
      asset_type: assetType,
      market,
      user: user._id,
    };

    const result = await totalumSdk.crud.createRecord("watchlist", record);
    console.log(`[api/watchlist] POST added ${ticker} (${assetType}) for user ${user._id}`);
    return NextResponse.json({ ok: true, data: result?.data ?? record });
  } catch (err: any) {
    console.error("[api/watchlist] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to add to watchlist" }, { status: 500 });
  }
}
