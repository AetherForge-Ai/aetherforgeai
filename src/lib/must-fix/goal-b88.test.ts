/** b88: AI-BUY-1 Buy/Sell labels + TT b87 P3 pricing gate. pull-check:v3-b90-2026-10-29 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { directionLabel, FLAT_BAND_PCT, LABEL_TOOLTIP } from "@/lib/buy-label";

const read = (p: string) => readFileSync(p, "utf8");
const days = (pct: number) => Array.from({ length: 7 }, (_, i) => ({ day: `Day ${i + 1}`, direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat", movePct: pct, confidence: 50 })) as never;
const call = (lo: number, hi: number) => ({ horizon: "7d", range: "", oddsPct: 50, killPrice: 1, realizedVolPct: null, bear: [1, 2], base: [lo, hi], bull: [3, 4] }) as never;

describe("b88 pins", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b91-2026-10-29");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b90-2026-10-29");
  });
});

describe("AI-BUY-1 direction labels", () => {
  it("Buy when the base-range midpoint is above the price", () => {
    expect(directionLabel({ price: 100, call: call(102, 106), shortTerm: [] })).toEqual({ label: "Buy", basis: "base-range", predictedPct: 4 });
  });
  it("Sell when the base-range midpoint is below the price", () => {
    expect(directionLabel({ price: 100, call: call(94, 98), shortTerm: [] })).toEqual({ label: "Sell", basis: "base-range", predictedPct: -4 });
  });
  it("base range wins over the 7-day path", () => {
    expect(directionLabel({ price: 100, call: call(94, 98), shortTerm: days(1) })?.label).toBe("Sell");
  });
  it("falls back to the bot's 7-day path when there is no base range", () => {
    expect(directionLabel({ price: 100, shortTerm: days(0.5) })).toMatchObject({ label: "Buy", basis: "seven-day-path" });
    expect(directionLabel({ price: 100, shortTerm: days(-0.5) })).toMatchObject({ label: "Sell", basis: "seven-day-path" });
  });
  it("no label: flat, no prediction, partial path, no price, no history", () => {
    expect(directionLabel({ price: 100, call: call(99.96, 100.04), shortTerm: [] })).toBeNull();
    expect(directionLabel({ price: 100, shortTerm: days(0) })).toBeNull();
    expect(directionLabel({ price: 100, shortTerm: [] })).toBeNull();
    expect(directionLabel({ price: 100, shortTerm: (days(1) as unknown as unknown[]).slice(0, 3) as never })).toBeNull();
    expect(directionLabel({ price: 100, priceUnavailable: true, call: call(110, 120), shortTerm: [] })).toBeNull();
    expect(directionLabel({ price: 100, analysisUnavailable: true, call: call(110, 120), shortTerm: [] })).toBeNull();
    expect(directionLabel({ price: 0, call: call(110, 120), shortTerm: [] })).toBeNull();
    expect(FLAT_BAND_PCT).toBe(0.1);
  });
  it("card shows green Buy / red Sell with the tooltip, disclaimer kept, no model names", () => {
    const s = read("src/components/bots/ApexReport.tsx");
    expect(s).toContain("<DirectionBadge t={t} />");
    expect(s).toContain("title={LABEL_TOOLTIP}");
    expect(s).toMatch(/"Buy"\s*\?\s*"border-emerald-500\/40 bg-emerald-500\/15 text-gain"\s*:\s*"border-rose-500\/40 bg-rose-500\/15 text-rose-600"/);
    expect(s).toContain("Nothing here is personalised financial advice");
    expect(LABEL_TOOLTIP).toContain("Not financial advice.");
    for (const t of [s, read("src/lib/buy-label.ts")]) expect(t).not.toMatch(/grok|gpt|claude|gemini|llama|ULTRA|ZENITH/i);
  });
});

describe("TT b87 P3 /pricing for subscribers", () => {
  it("final trial CTA (heading and buttons) sits inside SubscriberGate", () => {
    const p = read("src/app/pricing/page.tsx");
    const gate = p.lastIndexOf("<SubscriberGate");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(p.indexOf("Start the 14-day Pro trial for the full research desk"));
    expect(p.lastIndexOf("</SubscriberGate>")).toBeGreaterThan(p.indexOf('<Link href="/register">Start Free</Link>'));
    expect(read("src/components/pricing/SubscriberGate.tsx")).toContain("hasLiveSubscription(j)");
  });
});

import { buildDexPanel, DEX_PANEL_LIMIT } from "@/lib/dex-news-panel";
const dexRow = (i: number, over: Record<string, unknown> = {}) =>
  ({ id: `t${i}`, symbol: `T${i}`, name: `Token ${i}`, price: 1 + i, priceUnavailable: false, volume24h: i * 1000, network: "Base", dex: "Uniswap V3", detailId: null, ...over }) as never;

describe("MN-DEX-1 DEX tokens on /market-news", () => {
  const now = Date.parse("2026-10-28T00:00:00Z");
  it("shows real rows by 24h volume, capped, dropping unpriced rows", () => {
    const rows = [...Array.from({ length: 14 }, (_, i) => dexRow(i + 1)), dexRow(99, { price: null, priceUnavailable: true, volume24h: 9e9 })];
    const p = buildDexPanel({ at: "2026-10-27T23:55:00Z", rows }, now);
    expect(p.rows).toHaveLength(DEX_PANEL_LIMIT);
    expect(p.rows[0].symbol).toBe("T14");
    expect(p.rows.some((r) => r.symbol === "T99")).toBe(false);
    expect(p.rows[0].price).toBe("US$15.00");
  });
  it("no snapshot or a stale one shows no prices, never made-up rows", () => {
    expect(buildDexPanel(null, now).rows).toEqual([]);
    expect(buildDexPanel({ at: "2026-10-27T20:00:00Z", rows: [dexRow(1)] }, now)).toMatchObject({ rows: [] });
  });
  it("panel is rendered above the feed with no breakpoint hiding", () => {
    const c = read("src/components/market-news/DexTokensPanel.tsx");
    expect(c).not.toMatch(/\bhidden\b|sm:block|md:block|lg:block|max-h-0|h-0/);
    expect(c).toContain("grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3");
    const m = read("src/components/dashboard/MarketNewsPageContent.tsx");
    expect(m.indexOf("<DexTokensPanel")).toBeGreaterThan(0);
    expect(m.indexOf("<DexTokensPanel")).toBeLessThan(m.indexOf("<NewsFeed"));
    expect(read("src/app/market-news/page.tsx")).toContain("dexPanel={dexPanel}");
  });
});
