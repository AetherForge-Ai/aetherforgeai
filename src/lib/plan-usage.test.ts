import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatNzd } from "@/lib/currency";
import {
  APEX_DUAL_PUBLIC_NOTE,
  PUBLISHED_PLAN_PRICES,
  currentPlanName,
  describeAccountPlan,
  renewalLabel,
  usageAgainst,
} from "@/lib/plan-usage";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("H5 plan and billing", () => {
  it("names the published ladder and keeps the NZ$ prices", () => {
    expect(PUBLISHED_PLAN_PRICES).toContain(formatNzd(0));
    expect(PUBLISHED_PLAN_PRICES).toContain(formatNzd(16));
    expect(PUBLISHED_PLAN_PRICES).toContain(formatNzd(49));
    expect(PUBLISHED_PLAN_PRICES).toContain(formatNzd(199));
    expect(PUBLISHED_PLAN_PRICES).toContain(formatNzd(160));
    expect(PUBLISHED_PLAN_PRICES).toContain(formatNzd(490));
    expect(PUBLISHED_PLAN_PRICES).toContain(formatNzd(1990));
    expect(PUBLISHED_PLAN_PRICES).toBe(
      "Free NZ$0.00, Starter NZ$16.00 a month or NZ$160.00 a year, Pro NZ$49.00 a month or NZ$490.00 a year, Ultimate NZ$199.00 a month or NZ$1,990.00 a year.",
    );
    expect(PUBLISHED_PLAN_PRICES).not.toMatch(/GST/i);
    expect(APEX_DUAL_PUBLIC_NOTE).toContain("Apex Dual");
    expect(APEX_DUAL_PUBLIC_NOTE).toContain("not one of the published plans");
    expect(APEX_DUAL_PUBLIC_NOTE).toContain("Headmaster");
  });

  it("shows usage against the published caps", () => {
    const free = describeAccountPlan({
      plan: "free",
      status: "active",
      holdingsUsed: 2,
      reportsUsed: 1,
      assistantUsed: 4,
    });
    expect(free.planName).toBe("Free");
    expect(free.renewal).toBe("No renewal date");
    expect(free.holdings).toBe("2 / 10");
    expect(free.reports).toBe("1 / 3");
    expect(free.assistant).toBe("4 / 20");

    const starter = describeAccountPlan({
      plan: "starter_monthly",
      status: "active",
      expiresAt: "2026-11-10",
      holdingsUsed: 11,
      reportsUsed: 6,
      assistantUsed: 21,
    });
    expect(starter.planName).toBe("Starter");
    expect(starter.renewal).toBe("10 Nov 2026");
    expect(starter.holdings).toBe("11 / 25 per bot");
    expect(starter.reports).toBe("6 / 15");
    expect(starter.assistant).toBe("21 / 100");

    const pro = describeAccountPlan({
      plan: "pro_yearly",
      status: "active",
      holdingsUsed: 0,
      reportsUsed: 0,
      assistantUsed: 0,
    });
    expect(pro.planName).toBe("Pro");
    expect(pro.holdings).toBe("0 / 75 per bot");
    expect(pro.reports).toBe("0 / unlimited");
    expect(pro.assistant).toBe("0 / 500");

    const ultimate = describeAccountPlan({
      plan: "ultimate_monthly",
      status: "active",
      holdingsUsed: 80,
      reportsUsed: 2,
      assistantUsed: 9,
    });
    expect(ultimate.planName).toBe("Ultimate");
    expect(ultimate.holdings).toBe("80 / unlimited");
    expect(ultimate.reports).toBe("2 / unlimited");
    expect(ultimate.assistant).toBe("9 / unlimited");

    const dual = describeAccountPlan({
      plan: "dual_yearly",
      status: "active",
      holdingsUsed: 3,
      reportsUsed: null,
      assistantUsed: 1,
    });
    expect(dual.planName).toBe("Apex Dual");
    expect(dual.holdings).toBe("3 / 20 per bot");
    const stamped = describeAccountPlan({
      plan: "dual_yearly",
      status: "active",
      holdingsUsed: 4,
      reportsUsed: null,
      assistantUsed: 1,
      tickerLimit: 51,
    });
    expect(stamped.holdings).toBe("4 / 51 per bot");
    expect(stamped.scopeNote).toMatch(/same holdings cap as the dashboard and profile/);
    expect(dual.reports).toBe("— / unlimited");
    expect(dual.assistant).toBe("1 / unlimited");
    expect(dual.apexNote).toBe(APEX_DUAL_PUBLIC_NOTE);
    expect(dual.upgradeHref).toBe("/pricing");
  });

  it("keeps an inactive paid stamp on Free and leaves a missing count blank", () => {
    expect(currentPlanName("pro_monthly", "canceled")).toBe("Free");
    expect(currentPlanName("dual_yearly", "canceled")).toBe("Apex Dual");
    expect(renewalLabel("2026-10-10", "pro_monthly", "canceled")).toBe("No renewal date");
    expect(usageAgainst(null, "10")).toBe("— / 10");
  });

  it("adds the settings pages and the /billing redirect without a new checkout", () => {
    const billing = read("src/app/settings/billing/page.tsx");
    const notifications = read("src/app/settings/notifications/page.tsx");
    const alias = read("src/app/billing/page.tsx");
    const config = read("next.config.ts");
    const pricing = read("src/app/pricing/page.tsx");
    const faq = read("src/components/pricing/PricingFAQ.tsx");
    expect(billing).toContain("Plan & billing");
    expect(billing).toContain("Current plan");
    expect(billing).toContain("Holdings");
    expect(billing).toContain("Reports this month");
    expect(billing).toContain("Market Assistant this month");
    expect(billing).toContain('redirect("/login?redirect=/settings/billing")');
    expect(billing).not.toMatch(/GST/i);
    expect(billing).not.toContain("stripe.checkout");
    expect(notifications).toContain("Notifications");
    const prefs = read("src/lib/notification-prefs.ts");
    expect(prefs).toContain('label: "Report ready"');
    expect(prefs).toContain('label: "Trade and ledger"');
    expect(prefs).toContain('label: "Weekly summary"');
    expect(prefs).toContain('label: "Product news"');
    expect(read("src/components/settings/NotificationsPanel.tsx")).toContain("EMAIL_PREF_FIELDS");
    expect(read("src/components/settings/NotificationsPanel.tsx")).toContain("No email was sent.");
    expect(alias).toContain('redirect("/settings/billing")');
    expect(config).toContain('source: "/billing"');
    expect(config).toContain('destination: "/settings/billing"');
    expect(pricing).toContain("Apex Dual");
    expect(pricing).toContain("APEX_DUAL_PUBLIC_NOTE");
    expect(faq).toContain("/settings/billing");
    expect(read("src/components/settings/SettingsSectionNav.tsx")).toContain('href: "/settings/billing"');
    expect(read("src/components/settings/SettingsSectionNav.tsx")).toContain('href: "/settings/notifications"');
  });
});
