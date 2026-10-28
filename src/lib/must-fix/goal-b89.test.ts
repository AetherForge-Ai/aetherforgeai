/** b89: START-1/2/3, docs Income & Tax guide, /pricing hero. pull-check:v3-b89-2026-10-29 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DIP_CTA_CONFIG, dipCtaReady } from "@/lib/dip-cta";
import { dipCtaEnabled } from "@/lib/feature-flags";
import { documentAccess } from "@/lib/route-gate";
import { docsGuide } from "@/lib/docs-guides";
import { startHereDismissKey } from "@/components/start-here/StartHereButton";

const read = (p: string) => readFileSync(p, "utf8");

describe("b89 pins", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b89-2026-10-29");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b89-2026-10-29");
  });
});

describe("START-1 dashboard button", () => {
  it("renders on the signed-in home dashboard only, dismiss stored per user", () => {
    const d = read("src/components/dashboard/PortfolioDashboard.tsx");
    expect(d).toContain("{isHome && !preview ? <StartHereButton userId={userId} /> : null}");
    expect(startHereDismissKey("u1")).toBe("af:start-here-dismissed:u1");
    expect(startHereDismissKey("u1")).not.toBe(startHereDismissKey("u2"));
    const b = read("src/components/start-here/StartHereButton.tsx");
    expect(b).toContain("New here? Start here");
    expect(b).toContain("localStorage.setItem(key, \"1\")");
    expect(b).toContain("data-start-here-link"); // still findable after dismiss
  });
  it("is always findable from the menu and Help", () => {
    expect(read("src/components/TopNav.tsx")).toContain('{ href: "/start-here", label: "Start here", icon: Footprints }');
    expect(read("src/app/help/page.tsx")).toContain('href="/start-here"');
    expect(documentAccess("/start-here")).toBe("public");
  });
});

describe("START-2 /start-here", () => {
  const p = read("src/app/start-here/page.tsx");
  it("covers the five topics, NZ$, not financial advice", () => {
    for (const t of ["What investing is", "What this app shows you", "Adding what you own", "What each tab means", "What Buy and Sell labels mean"]) expect(p).toContain(t);
    for (const t of ["Holdings", "Transactions", "Income &amp; Tax", "Insights", "Record a transaction"]) expect(p).toContain(t);
    expect(p).toContain("not financial advice");
    expect(p).toContain("NZ$");
    expect(p).toContain("formatNzd(starter.monthlyPrice");
  });
  it("no tax claims, no GST, no model names, no photos of people, no flagged features", () => {
    expect(p).not.toMatch(/\bGST\b|tax[- ]free|deductible|grok|gpt|claude|gemini|llama|ULTRA|ZENITH|<img|Headmaster goals|sale preview|alerts/i);
    expect(p).not.toMatch(/Math\.random/);
  });
});

describe("START-3 DIP_CTA", () => {
  it("is off by default and the placeholder config never renders", () => {
    expect(dipCtaEnabled({})).toBe(false);
    expect(dipCtaEnabled({ DIP_CTA: "1" })).toBe(true);
    expect(DIP_CTA_CONFIG).toEqual({ label: null, amountNzd: null, whatYouGet: null, href: null });
    expect(dipCtaReady(true)).toBe(false);
    expect(dipCtaReady(false, { label: "x", amountNzd: 5, whatYouGet: "y", href: "/z" })).toBe(false);
    expect(dipCtaReady(true, { label: "x", amountNzd: 5, whatYouGet: "y", href: "/z" })).toBe(true);
    expect(read("src/app/start-here/page.tsx")).toContain("dipCtaReady(dipCtaEnabled())");
  });
});

describe("docs Income & Tax guide matches the live tab", () => {
  it("names only what the tab shows", () => {
    const g = docsGuide("income-and-tax-view");
    const text = JSON.stringify(g);
    expect(text).not.toMatch(/withholding|gross income/i);
    expect(text).toContain("dividend cash, realised gains and FIF");
    expect(read("src/components/dashboard/IncomeTaxPanel.tsx")).toContain('label="Dividend cash"');
  });
});

describe("/pricing hero for subscribers", () => {
  it("server decides, hero and final CTA gated, trial trust item dropped", () => {
    const p = read("src/app/pricing/page.tsx");
    expect(p).toContain("hasLiveSubscription(user ? { plan: user.subscription_plan, status: user.subscription_status } : null)");
    expect(p.match(/initialSubscriber=\{subscriber\}/g)?.length).toBe(2);
    expect(p).toContain("data-pricing-hero-subscriber");
    expect(p).toContain("!(subscriber && /trial/i.test(item.label))");
  });
});
