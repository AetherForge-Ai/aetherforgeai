/**
 * DASH-CLEAN-D b82. pull-check:v3-b90-2026-10-29
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { compactNzd, KPI_NOT_AVAILABLE } from "@/lib/kpi-compact";
import { dedupeCrossFeedCoins, fmtPriceSig, type CoinMarket } from "@/lib/crypto-market";

const read = (p: string) => readFileSync(p, "utf8");
const coin = (id: string, name: string, symbol: string, rank: number, source: string, price = 1): CoinMarket =>
  ({ id, name, symbol, rank, source, price, image: "", marketCap: 1, fdv: null, volume24h: 1, change1h: null, change24h: 0, change7d: 0, high24h: null, low24h: null, circulatingSupply: null, totalSupply: null, maxSupply: null, ath: null, athDate: null, atl: null, atlDate: null, sparkline7d: [] }) as CoinMarket;

describe("DASH-CLEAN-D b82", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b91-2026-10-29");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b90-2026-10-29");
  });

  it("compacts real NZ$ totals only, never inventing a value", () => {
    expect(compactNzd(1616452.28)).toBe("NZ$1.62M");
    expect(compactNzd(100000, true)).toBe("+NZ$100.00K");
    expect(compactNzd(-20336.7)).toBe("-NZ$20.34K");
    expect(compactNzd(null)).toBeNull();
    expect(compactNzd(Number.NaN)).toBeNull();
  });

  it("KPI cards: clamp font, compact only when it does not fit, full value in title and aria-label, one column below 420px, icon on its own row", () => {
    const kpi = read("src/components/dashboard/KpiHeader.tsx");
    expect(kpi).toContain("grid-cols-1 gap-2 min-[420px]:grid-cols-2");
    expect(kpi).toContain('fontSize: "clamp(1rem, 0.8rem + 1.4vw, 1.25rem)"');
    expect(kpi).toContain("title={full}");
    expect(kpi).toContain("<span className=\"sr-only\">{`${label} ${full}`}</span>"); // b84: sr-only, not aria-label on a span
    expect(kpi).toContain("fits || !short ? full : short");
    expect(kpi).toMatch(/<KpiMoney figure=\{view\.netWorth\}/);
    expect(kpi).toMatch(/<KpiMoney figure=\{view\.cash\}/);
    expect(kpi).toMatch(/<KpiMoney figure=\{view\.contributions\}[^>]*signed/);
    expect(KPI_NOT_AVAILABLE).toBe("Not available yet");
    expect(kpi).toContain('data-kpi-empty="total-return"');
  });

  it("market list prices to significant figures", () => {
    expect(fmtPriceSig(0.0033339612)).toBe("US$0.003334");
    expect(fmtPriceSig(1.0912)).toBe("US$1.09");
    expect(fmtPriceSig(null)).toBe("—");
  });

  it("collapses a coin sent by two feeds, keeps distinct coins from one feed", () => {
    const out = dedupeCrossFeedCoins([
      coin("beam-2", "Beam Token", "BEAM", 193, "coingecko"),
      coin("beam-eth", "Beam Token", "BEAM", 194, "coinpaprika"),
      coin("a", "Same", "SAME", 5, "coingecko"),
      coin("b", "Same", "SAME", 6, "coingecko"),
    ]);
    expect(out.map((c) => c.id)).toEqual(["beam-2", "a", "b"]);
  });

  it("modal: title clear of Close, phone columns, source named while live", () => {
    const modal = read("src/components/dashboard/crypto/CryptoMarketModal.tsx");
    expect(modal).toContain('className="min-w-0 pr-12 md:pr-8"');
    expect(modal).toContain("grid-cols-[minmax(0,1fr)_auto_4.5rem] lg:grid-cols-");
    expect(modal).not.toContain("publicCoinSourceLine()");
    expect(modal).toContain("dedupeCrossFeedCoins(coins)");
  });

  it("tab strip snaps and fades at a scrollable edge", () => {
    const calc = read("src/components/dashboard/DashboardCalculator.tsx");
    expect(calc).toContain("grid scroll-mt-24 grid-cols-2");
    expect(calc).toContain("sm:snap-x sm:snap-mandatory");
    expect(calc).toContain('data-tab-fade="right"');
    expect(calc).toContain("snap-start");
  });
});
