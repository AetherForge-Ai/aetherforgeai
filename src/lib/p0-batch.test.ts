import { describe, expect, it } from "vitest";
import { PRICING_TIERS } from "@/lib/plans";
import { checkTickerQuota, resolveTickerLimit } from "@/lib/entitlements";

describe("P0 pricing and free cap", () => {
  it("features Pro and keeps Ultimate as an enquiry", () => {
    const pro = PRICING_TIERS.find((t) => t.id === "pro");
    const starter = PRICING_TIERS.find((t) => t.id === "starter");
    const ultimate = PRICING_TIERS.find((t) => t.id === "ultimate");
    expect(pro?.featured).toBe(true);
    expect(pro?.monthlyPrice).toBe(69);
    expect(pro?.cta.label).toBe("Start with Pro");
    expect(starter?.monthlyPrice).toBe(29);
    expect(starter?.cta.label.toLowerCase()).not.toContain("pro");
    expect(ultimate?.cta.kind).toBe("sales");
    expect(ultimate?.cta.label).toBe("Talk to us");
    expect(ultimate?.featured).toBeFalsy();
  });

  it("does not let a legacy stamp of 3 lock Free below 8 holdings", () => {
    expect(resolveTickerLimit({ subscription_plan: "free", ticker_limit: 3 })).toBe(8);
    expect(resolveTickerLimit({ subscription_plan: "none", ticker_limit: 3 })).toBe(8);
    expect(resolveTickerLimit({ subscription_plan: "pro_monthly", ticker_limit: 75 })).toBe(75);
  });

  it("points an over-cap Free member at Pro, not Ultimate checkout", () => {
    const quota = checkTickerQuota(
      { subscription_plan: "free", ticker_limit: 8 },
      Array.from({ length: 8 }, () => ({ asset_type: "stock" })),
      "stock"
    );
    expect(quota.allowed).toBe(false);
    expect(quota.upgradeHref).toBe("/pricing#pro");
    expect(quota.message).toMatch(/Pro/);
    expect(quota.message).not.toMatch(/Ultimate/);
  });
});
