import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { referencePrice } from "@/lib/market";
import { limitScope, resolveTickerLimit, usedTickerCount } from "@/lib/entitlements";

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
  // Interleaved stock/crypto so a quota-capped seed (e.g. the 3-ticker free
  // tier) still lands a balanced mix across both bots.
  { ticker: "AIR.NZ", asset_type: "stock", company_name: "Air New Zealand", sector: "Industrials", shares: 5000, current: 0.68, costFactor: 0.91 },
  { ticker: "BTC", asset_type: "crypto", company_name: "Bitcoin", sector: "Digital Assets", shares: 0.12, current: 96850, costFactor: 0.78 },
  { ticker: "FPH.NZ", asset_type: "stock", company_name: "Fisher & Paykel Healthcare", sector: "Healthcare", shares: 120, current: 36.8, costFactor: 0.83 },
  { ticker: "ETH", asset_type: "crypto", company_name: "Ethereum", sector: "Digital Assets", shares: 2, current: 3420, costFactor: 0.86 },
  { ticker: "MEL.NZ", asset_type: "stock", company_name: "Meridian Energy", sector: "Utilities", shares: 800, current: 6.15, costFactor: 1.06 },
  { ticker: "SPK.NZ", asset_type: "stock", company_name: "Spark New Zealand", sector: "Telecom", shares: 900, current: 4.2, costFactor: 1.12 },
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

    // Only seed as many holdings as the user's plan lets them monitor, so a
    // free member (3 tickers) doesn't land on a dashboard that's already over
    // quota. We keep a balanced mix (both bots) up to the limit.
    const scope = limitScope(record.subscription_plan);
    const limit = resolveTickerLimit(record);
    const toSeed: typeof STARTER_HOLDINGS = [];
    for (const h of STARTER_HOLDINGS) {
      if (usedTickerCount(toSeed, h.asset_type, scope) >= limit) continue;
      toSeed.push(h);
    }

    console.log(
      `[seed] Seeding ${toSeed.length}/${STARTER_HOLDINGS.length} starter holdings for user ${userId} (plan=${record.subscription_plan ?? "none"}, limit=${limit}, scope=${scope})`
    );

    for (const h of toSeed) {
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
    console.log(`[seed] Seeded ${toSeed.length} holdings for user ${userId}`);
    return true;
  } catch (err) {
    // Non-critical onboarding convenience — log but never block the request.
    console.error("[seed] Failed to seed starter portfolio:", err);
    return false;
  }
}
