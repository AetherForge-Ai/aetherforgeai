import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { lookupTicker, referencePrice } from "@/lib/market";

/**
 * Sample starter holdings seeded once for each brand-new user so their
 * dashboard is populated on first visit. Purchase prices are set relative to
 * current reference prices to produce a realistic mix of gains and losses.
 */
const STARTER_HOLDINGS: { ticker: string; shares: number; costFactor: number }[] = [
  { ticker: "AAPL", shares: 25, costFactor: 0.82 }, // gain
  { ticker: "NVDA", shares: 40, costFactor: 0.61 }, // strong gain
  { ticker: "MSFT", shares: 12, costFactor: 0.9 }, // gain
  { ticker: "TSLA", shares: 15, costFactor: 1.18 }, // loss
  { ticker: "AMZN", shares: 18, costFactor: 0.94 }, // small gain
  { ticker: "JPM", shares: 20, costFactor: 1.05 }, // small loss
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
      const info = lookupTicker(h.ticker);
      const current = referencePrice(h.ticker, info?.price ?? 100);
      const purchase_price = Number((current * h.costFactor).toFixed(2));
      await totalumSdk.crud.createRecord("stock", {
        ticker: h.ticker,
        company_name: info?.name || h.ticker,
        sector: info?.sector || "Other",
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
