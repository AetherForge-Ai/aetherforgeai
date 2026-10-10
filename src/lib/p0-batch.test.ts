import { describe, expect, it } from "vitest";
import { LEGACY_SUBSCRIPTION_PLANS, PLANS, PRICING_TIERS, planByKey, planByPriceId } from "@/lib/plans";
import {
  assistantQueryLimit,
  canExportCsv,
  checkTickerQuota,
  coachRequestsTotalum,
  headmasterDepth,
  monthlyReportLimit,
  resolveTickerLimit,
} from "@/lib/entitlements";

describe("P0 pricing and free cap", () => {
  it("features Pro and keeps Ultimate as an enquiry", () => {
    const pro = PRICING_TIERS.find((t) => t.id === "pro");
    const starter = PRICING_TIERS.find((t) => t.id === "starter");
    const ultimate = PRICING_TIERS.find((t) => t.id === "ultimate");
    expect(pro?.featured).toBe(true);
    expect(pro?.monthlyPrice).toBe(49);
    expect(pro?.yearlyPrice).toBe(490);
    expect(pro?.cta.label).toBe("Start 14-day Pro trial");
    expect(pro?.badge).toBe("Recommended");
    expect(starter?.monthlyPrice).toBe(16);
    expect(starter?.yearlyPrice).toBe(160);
    expect(starter?.cta.label.toLowerCase()).not.toContain("pro");
    expect(starter?.featured).toBeFalsy();
    expect(ultimate?.cta.kind).toBe("sales");
    expect(ultimate?.cta.label).toBe("Talk to us");
    expect(ultimate?.monthlyPlanKey).toBeNull();
    expect(ultimate?.featured).toBeFalsy();
    expect(PRICING_TIERS.filter((t) => t.featured).map((t) => t.id)).toEqual(["pro"]);
  });

  it("keeps retired Starter and Pro price IDs for existing subscribers and sells no Ultimate link", () => {
    expect(planByKey("starter_monthly")?.price).toBe(16);
    expect(planByKey("pro_yearly")?.price).toBe(490);
    expect(planByKey("ultimate_monthly")?.paymentLink).toBe("");
    expect(planByKey("ultimate_yearly")?.paymentLink).toBe("");
    expect(planByPriceId("price_1TsjfH9sOmzarzYkYpuvCfuA")?.price).toBe(29);
    expect(planByPriceId("price_1TsjfH9sOmzarzYkj43Mf2Zh")?.price).toBe(290);
    expect(planByPriceId("price_1TsjfI9sOmzarzYkiDEzedgi")?.price).toBe(69);
    expect(planByPriceId("price_1TsjfI9sOmzarzYkyyURWr4E")?.price).toBe(690);
    expect(planByPriceId("price_1TsjfJ9sOmzarzYkM1QYb3tU")?.key).toBe("ultimate_monthly");
    expect(planByPriceId("price_1TsjfJ9sOmzarzYkRBYlUacp")?.key).toBe("ultimate_yearly");
    const retiredLinks = [
      "7sYaER8YDdwj8a3bPF1440l",
      "4gM8wJdeT8bZ1LFg5V1440k",
      "aFa6oBa2H9g3eyraLB1440j",
      "7sYbIVgr5fEr0HBg5V1440i",
      "fZu4gt6QvfEr61V5rh1440h",
      "4gMbIV3Ej9g38a34nd1440g",
    ];
    for (const plan of [...PLANS, ...LEGACY_SUBSCRIPTION_PLANS]) {
      for (const slug of retiredLinks) {
        expect(plan.paymentLink).not.toContain(slug);
      }
    }
    expect(monthlyReportLimit("free")).toBe(3);
    expect(monthlyReportLimit("starter_monthly")).toBe(15);
    expect(monthlyReportLimit("pro_monthly")).toBeNull();
    expect(assistantQueryLimit("free")).toBe(20);
    expect(assistantQueryLimit("starter_yearly")).toBe(100);
    expect(assistantQueryLimit("pro_monthly")).toBe(500);
    expect(assistantQueryLimit("ultimate_monthly")).toBeNull();
    expect(canExportCsv("free")).toBe(false);
    expect(canExportCsv("starter_monthly")).toBe(true);
    expect(headmasterDepth("free")).toBe("none");
    expect(headmasterDepth("starter_monthly")).toBe("basic");
    expect(headmasterDepth("pro_yearly")).toBe("full");
    expect(headmasterDepth("ultimate_monthly")).toBe("full");
    expect(coachRequestsTotalum("free", true)).toBe(false);
    expect(coachRequestsTotalum("starter_monthly", false)).toBe(false);
    expect(coachRequestsTotalum("starter_monthly", true)).toBe(true);
  });

  it("does not let a legacy stamp of 3 lock Free below 10 holdings", () => {
    expect(resolveTickerLimit({ subscription_plan: "free", ticker_limit: 3 })).toBe(10);
    expect(resolveTickerLimit({ subscription_plan: "none", ticker_limit: 3 })).toBe(10);
    expect(resolveTickerLimit({ subscription_plan: "pro_monthly", ticker_limit: 75 })).toBe(75);
  });

  it("points an over-cap Free member at Pro, not Ultimate checkout", () => {
    const quota = checkTickerQuota(
      { subscription_plan: "free", ticker_limit: 10 },
      Array.from({ length: 10 }, () => ({ asset_type: "stock" })),
      "stock"
    );
    expect(quota.allowed).toBe(false);
    expect(quota.upgradeHref).toBe("/pricing#pro");
    expect(quota.message).toMatch(/Pro/);
    expect(quota.message).not.toMatch(/Ultimate/);
  });
});
