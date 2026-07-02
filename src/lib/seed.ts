import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { referencePrice } from "@/lib/market";

/**
 * Sample starter holdings seeded once for each brand-new user so their
 * dashboard is populated on first visit. Purchase prices are set relative to
 * current reference prices to produce a realistic mix of gains and losses.
 */
const STARTER_HOLDINGS: {
  ticker: string;
  asset_type: "stock" | "crypto";
  company_name: string;
  sector: string;
  shares: number;
  current: number;
  costFactor: number;
}[] = [
  // NZ-focused equities
  { ticker: "AIR.NZ", asset_type: "stock", company_name: "Air New Zealand", sector: "Industrials", shares: 5000, current: 0.68, costFactor: 0.91 },
  { ticker: "FPH.NZ", asset_type: "stock", company_name: "Fisher & Paykel Healthcare", sector: "Healthcare", shares: 120, current: 36.8, costFactor: 0.83 },
  { ticker: "MEL.NZ", asset_type: "stock", company_name: "Meridian Energy", sector: "Utilities", shares: 800, current: 6.15, costFactor: 1.06 },
  { ticker: "SPK.NZ", asset_type: "stock", company_name: "Spark New Zealand", sector: "Telecom", shares: 900, current: 4.2, costFactor: 1.12 },
  // Digital assets
  { ticker: "BTC", asset_type: "crypto", company_name: "Bitcoin", sector: "Digital Assets", shares: 0.12, current: 96850, costFactor: 0.78 },
  { ticker: "ETH", asset_type: "crypto", company_name: "Ethereum", sector: "Digital Assets", shares: 2, current: 3420, costFactor: 0.86 },
];

/**
 * Seeds a starter portfolio for the user the first time they reach the app.
 * Guarded by the `onboarded` flag so deleting all holdings never re-seeds.
 */
export async function seedStarterPortfolioIfNeeded(userId: string): Promise<boolean> {
  try {
    const res = await totalumSdk.crud.getRecordById("user", userId);
    const record = (res as any)?.data;
    if (!record || record.onboarded === "yes") return false;

    console.log(`[seed] Seeding starter portfolio for user ${userId}`);

    for (const h of STARTER_HOLDINGS) {
      // Prefer a known reference price; fall back to the item's own current price.
      const current = referencePrice(h.ticker, h.current);
      const purchase_price = Number((current * h.costFactor).toFixed(current < 5 ? 4 : 2));
      await totalumSdk.crud.createRecord("stock", {
        ticker: h.ticker,
        asset_type: h.asset_type,
        company_name: h.company_name,
        sector: h.sector,
        shares: h.shares,
        purchase_price,
        current_price: current,
        user: userId,
      });
    }

    await totalumSdk.crud.editRecordById("user", userId, { onboarded: "yes" });
    console.log(`[seed] Seeded ${STARTER_HOLDINGS.length} holdings for user ${userId}`);
    return true;
  } catch (err) {
    // Non-critical onboarding convenience — log but never block the request.
    console.error("[seed] Failed to seed starter portfolio:", err);
    return false;
  }
}
