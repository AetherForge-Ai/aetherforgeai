import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PRICING_FAQS } from "@/lib/pricing-faq";
import { freePlanLine } from "@/lib/free-bot-choice";
import { portfolioCoachFallbackReply } from "@/lib/portfolio-coach-knowledge";

const read = (p: string) => readFileSync(p, "utf8");

describe("TT fresh M1 — refunds agree with policy", () => {
  it("no prorated refund or cancel-and-switch-any-time promise", () => {
    const text = PRICING_FAQS.map((f) => f.a).join(" ");
    expect(text).not.toMatch(/unused time .* prorated/);
    expect(text).not.toMatch(/cancel or switch to monthly at any time/);
    expect(text).toMatch(/14 days/);
  });
});

describe("TT fresh M2/M3 — pricing", () => {
  it("discloses the 4-hour report spacing and fixes labels", () => {
    expect(read("src/lib/plans.ts")).toContain("one per bot every 4 hours");
    const cmp = read("src/components/pricing/FeatureComparison.tsx");
    expect(cmp).toContain("1 per bot every 4 h");
    expect(cmp).toContain("Allocation drift");
    expect(cmp).toContain("Price alerts");
    expect(cmp).toMatch(/mt-1 block w-fit[^>]*>\s*<span className="sr-only"> <\/span>Recommended/);
    expect(read("src/components/totalum/TotalumConsole.tsx")).not.toContain("Unlock The Headmaster with Pro");
  });
});

describe("TT fresh M4 — Free plan card", () => {
  it("names the Free plan, no purchase/expiry", () => {
    expect(freePlanLine("crypto")).toBe("Free plan · Koins · 3 reports a month · up to 10 holdings");
    const src = read("src/components/settings/SettingsClient.tsx");
    expect(src).toContain("isActive && !onFreePlan && (");
    expect(src).not.toContain('(user.subscription_status || "none").toUpperCase()');
  });
});

describe("TT fresh M5 — AI output", () => {
  it("Markdown renders _italic_ and prompts drop 'Headmaster skeleton'", () => {
    expect(read("src/components/Markdown.tsx")).toContain("<em key=");
    expect(read("src/lib/apex.ts")).not.toContain("Headmaster skeleton");
    expect(read("src/lib/report-consistency.ts")).not.toContain("Headmaster skeleton");
  });
  it("a portfolio-overview question is not answered with deposit steps", () => {
    const r = portfolioCoachFallbackReply("Is my portfolio looking how it should? Dashboard Overview");
    expect(r).toContain("Overview");
    expect(r).not.toMatch(/Deposit/);
  });
});
