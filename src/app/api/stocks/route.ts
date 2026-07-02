import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { lookupTicker, normalizeTicker, referencePrice } from "@/lib/market";
import { seedStarterPortfolioIfNeeded } from "@/lib/seed";

const createSchema = z.object({
  ticker: z.string().min(1, "Ticker is required").max(12),
  asset_type: z.enum(["stock", "crypto"]).optional(),
  shares: z.number().positive("Shares must be greater than 0"),
  purchase_price: z.number().positive("Purchase price must be greater than 0"),
  company_name: z.string().optional(),
  sector: z.string().optional(),
});

// GET /api/stocks — list the current user's holdings
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // First-visit onboarding: seed a starter portfolio so the dashboard
    // isn't empty. Guarded by the user's `onboarded` flag.
    const seeded = await seedStarterPortfolioIfNeeded(user._id);

    const result = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _sort: { createdAt: "desc" },
      _limit: 500,
    });

    const stocks = (result?.data as any[]) || [];
    if (seeded) {
      console.log(`[api/stocks] Seeded starter portfolio; now ${stocks.length} holdings`);
    }
    console.log(`[api/stocks] GET returned ${stocks.length} holdings for user ${user._id}`);

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
    const info = lookupTicker(ticker);
    const purchase_price = parsed.data.purchase_price;

    const record = {
      ticker,
      asset_type: parsed.data.asset_type || "stock",
      company_name: parsed.data.company_name || info?.name || ticker,
      sector: parsed.data.sector || info?.sector || (parsed.data.asset_type === "crypto" ? "Digital Assets" : "Other"),
      shares: parsed.data.shares,
      purchase_price,
      current_price: referencePrice(ticker, purchase_price),
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
