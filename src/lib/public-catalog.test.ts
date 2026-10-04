import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLIC_PRICE_SLOTS, publicPriceSlot } from "@/lib/public-catalog";
import { isSelfServeCheckoutPlan, planByKey } from "@/lib/plans";

describe("public price catalog", () => {
  it("sells only the specified Starter and Pro amounts", () => {
    expect(PUBLIC_PRICE_SLOTS.map((slot) => [slot.key, slot.unitAmount, slot.interval])).toEqual([
      ["starter_monthly", 1600, "month"],
      ["starter_yearly", 16000, "year"],
      ["pro_monthly", 4900, "month"],
      ["pro_yearly", 49000, "year"],
    ]);
    expect(publicPriceSlot("ultimate_monthly")).toBeUndefined();
    expect(PUBLIC_PRICE_SLOTS.some((slot) => slot.unitAmount === 2900 || slot.unitAmount === 6900)).toBe(
      false
    );
  });

  it("treats Starter and Pro as self-serve before a price id is committed", () => {
    expect(isSelfServeCheckoutPlan(planByKey("starter_monthly"))).toBe(true);
    expect(isSelfServeCheckoutPlan(planByKey("pro_yearly"))).toBe(true);
    expect(isSelfServeCheckoutPlan(planByKey("ultimate_monthly"))).toBe(false);
    expect(planByKey("starter_monthly")?.price).toBe(16);
    expect(planByKey("pro_monthly")?.price).toBe(49);
  });

  it("keeps the reprice script on the same four amounts", () => {
    const source = readFileSync("scripts/reprice-public-tiers.ts", "utf8");
    for (const slot of PUBLIC_PRICE_SLOTS) {
      expect(source).toContain(`unitAmount: ${slot.unitAmount}`);
      expect(source).toContain(`retiredPriceId: "${slot.retiredPriceId}"`);
    }
    expect(source).not.toMatch(/STRIPE_SECRET_KEY\s*=\s*["']sk_/);
  });
});
