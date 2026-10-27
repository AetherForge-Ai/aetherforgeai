/**
 * Goal loop batch b12 (M-1 M-2 M-6 G-01 G-02, cap wording, H-5 date, avatar label).
 * pull-check:v3-goal-b12-2026-10-18
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkTickerQuota } from "@/lib/entitlements";
import { DOCS_GUIDES, docsShot } from "@/lib/docs-guides";
import { dividendIncome, yieldBasesNzd, type DividendView } from "@/lib/dividend-ledger";
import { bookPerformance } from "@/lib/performance-book";

const read = (p: string) => readFileSync(p, "utf8");

describe("b12 pins", () => {
  it("build version", () => {
    expect(read("public/build-version.txt").trim()).toMatch(/^v3-(?:goal|h1|g24|dedupe|g10|del404|fix|m7|cr6|g18|cr6b|dashclean|dashclean-d|dashclean-e)-b(1[2-9]|[2-9][0-9])[a-z]?-/);
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-goal-b12-2026-10-18");
  });
});

describe("cap wording", () => {
  it("Free → Starter, Starter → Pro", () => {
    const ten = Array.from({ length: 10 }, () => ({ asset_type: "stock" }));
    const free = checkTickerQuota({ subscription_plan: "free", ticker_limit: 10 }, ten, "stock");
    expect(free.message).toContain("Upgrade to Starter");
    expect(free.upgradeHref).toBe("/pricing#starter");
    const s = checkTickerQuota({ subscription_plan: "starter_monthly", ticker_limit: 25 }, Array.from({ length: 25 }, () => ({ asset_type: "stock" })), "stock");
    expect(s.message).toContain("Upgrade to Pro");
  });
});

describe("H-5 duplicate check date", () => {
  it("a dividend body with no date is compared against today", () => {
    expect(read("src/app/api/transactions/route.ts")).toContain("input.trade_date || input.executed_at || new Date().toISOString()");
  });
});

describe("Settings avatar label", () => {
  it("no aria-label mismatch: visible initials plus sr-only text", () => {
    const s = read("src/components/settings/SettingsClient.tsx");
    expect(s).not.toContain('aria-label={`Upload profile photo');
    expect(s).toContain('<span className="sr-only">Upload profile photo</span>');
  });
});

describe("M-2 docs screenshots", () => {
  it("guides with a screenshot have the file, alt text and Example label", () => {
    expect(DOCS_GUIDES.length).toBeGreaterThanOrEqual(6);
    const withShot = DOCS_GUIDES.filter((g) => docsShot(g.slug));
    expect(withShot.length).toBeGreaterThanOrEqual(4);
    for (const g of withShot) {
      const shot = docsShot(g.slug)!;
      expect(shot.alt).toMatch(/^Example:/);
      expect(() => readFileSync(`public${shot.src}`)).not.toThrow();
    }
    expect(read("src/app/docs/[slug]/page.tsx")).toContain("Example — a synthetic book");
  });
});

describe("M-6 holdings fit", () => {
  it("multi-figure cells stack and numeric padding is compact", () => {
    const t = read("src/components/dashboard/UnifiedHoldingsTable.tsx");
    expect(t).toContain("flex-row flex-nowrap items-center justify-end gap-x-1 whitespace-nowrap");
    expect(t).toContain('"px-1 tabular-nums"');
  });
});

const view = (o: Partial<DividendView>): DividendView => ({ id: Math.random().toString(36), ticker: "FPH.NZ", when: "2026-10-14", cashNzd: 0, parts: null, ...o } as DividendView);

describe("G-01 dividend aggregates and yield", () => {
  it("net-only rows count in month and tax-year net; page total = month sum = year sum", () => {
    const parts = { grossNzd: 20.83, imputationNzd: 5.83, withholdingNzd: 0, drpNzd: 0, netCashNzd: 15, fx: 1 } as never;
    const rows = [view({ when: "2026-10-14", cashNzd: 15, parts }), view({ when: "2026-10-02", cashNzd: 15, parts: null })];
    const inc = dividendIncome(rows);
    expect(inc.cashNzd).toBe(30);
    expect(inc.months.reduce((s, m) => s + m.netCashNzd, 0)).toBe(30);
    expect(inc.years.reduce((s, y) => s + y.netCashNzd, 0)).toBe(30);
    expect(inc.months[0].breakdownMissing).toBe(1);
  });
  it("31 Mar / 1 Apr boundary splits tax years", () => {
    const inc = dividendIncome([view({ when: "2026-03-31", cashNzd: 10 }), view({ when: "2026-04-01", cashNzd: 7 })]);
    expect(inc.years.map((y) => [y.endingYear, y.netCashNzd])).toEqual([[2026, 10], [2027, 7]]);
  });
  it("trailing yield on cost and value from NZ$ holdings; overseas → — with reason", () => {
    const bases = yieldBasesNzd([{ ticker: "FPH.NZ", shares: 10, purchasePrice: 30, currentPrice: 40 }], ["FPH.NZ"]);
    expect(bases).toEqual({ costNzd: 300, valueNzd: 400, reason: null });
    const inc = dividendIncome([view({ when: "2026-06-01", cashNzd: 15 })], { asOf: "2026-10-18", costNzd: 300, valueNzd: 400 });
    expect(inc.yieldOnCost).toBeCloseTo(0.05, 6);
    expect(inc.yieldOnValue).toBeCloseTo(0.0375, 6);
    expect(yieldBasesNzd([], ["AAPL"]).reason).toMatch(/overseas/);
  });
});

describe("G-02 performance in the app", () => {
  const lines = read("fixtures/perf-20-trades.csv").split("\n").filter((l) => l && !l.startsWith("#")).slice(1);
  const parsed = lines.map((l) => l.split(",")).map(([date, v, f]) => ({ date, v: Number(v), f: Number(f) }));
  const flows = parsed.slice(0, -1);
  const end = parsed.at(-1)!;
  const expected = Object.fromEntries(read("fixtures/perf-20-trades.expected.csv").split("\n").filter((l) => l && !l.startsWith("#")).slice(1).map((l) => l.split(",")).map(([k, v]) => [k, Number(v)]));
  it("the app's bookPerformance matches the 20-flow golden file within 0.01%", () => {
    const ledger = flows.map((p) => ({ type: p.f >= 0 ? "deposit" : "withdraw", executed_at: p.date, total: Math.abs(p.f) }));
    const history = new Map(flows.map((p) => [p.date, p.v]));
    const perf = bookPerformance({ ledger, netWorthNzd: end.v, asOf: end.date, source: "Golden fixture", valueHistory: history });
    expect(Math.abs((perf.report!.xirr.value! - expected.xirr) / expected.xirr)).toBeLessThan(0.0001);
    expect(Math.abs((perf.report!.twr.value! - expected.twr) / expected.twr)).toBeLessThan(0.0001);
    expect(perf.report!.xirr.asOf).toBe(end.date);
    expect(perf.report!.xirr.source).toBe("Golden fixture");
  });
  it("empty and one-trade books show clear messages; no history → TWR — with reason", () => {
    expect(bookPerformance({ ledger: [], netWorthNzd: 0, asOf: "2026-10-18", source: "x" }).message).toMatch(/Add a deposit/);
    const one = bookPerformance({ ledger: [{ type: "deposit", executed_at: "2026-10-01", total: 1000 }], netWorthNzd: 1010, asOf: "2026-10-18", source: "x" });
    expect(one.message).toMatch(/One deposit/);
    const two = bookPerformance({ ledger: [{ type: "deposit", executed_at: "2026-01-01", total: 1000 }, { type: "deposit", executed_at: "2026-06-01", total: 500 }], netWorthNzd: 1600, asOf: "2026-10-18", source: "x" });
    expect(two.report!.xirr.value).not.toBeNull();
    expect(two.report!.twr.value).toBeNull();
    expect(two.report!.twr.reason).toMatch(/book value before each deposit/);
  });
});

describe("b12 CR-2 / CR-5 limiter keys", () => {
  it("IPv6 rotation inside one /64 shares a key; /48 groups /64s", async () => {
    const { ipBucket, ipBucket48, normaliseLoginEmail, sha256Hex } = await import("@/lib/ip-rate-limit");
    expect(ipBucket("2a09:bac1:57a0:18::15e:f0")).toBe(ipBucket("2a09:bac1:57a0:0018:ffff::1"));
    expect(ipBucket("2a09:bac1:57a0:18::15e:f0")).toBe("2a09:bac1:57a0:18::/64");
    expect(ipBucket48("2a09:bac5:4ec3:32a0::50b:65")).toBe(ipBucket48("2a09:bac5:4ec3:a0::10:4f4"));
    expect(normaliseLoginEmail("  TT-RateLimit@Example.INVALID ")).toBe("tt-ratelimit@example.invalid");
    expect(await sha256Hex("a")).toMatch(/^[0-9a-f]{64}$/);
    expect(read("src/app/api/auth/[...all]/route.ts")).toContain("login:email:${await sha256Hex(who)}");
    expect(read("wrangler.jsonc")).toContain("GUIDE48_RATE_LIMITER");
  });
  it("a shared store counts across two isolates", async () => {
    const m = await import("@/lib/ip-rate-limit");
    const rows = new Map<string, number>();
    m.setDurableCounterStore({ async increment(k) { const n = (rows.get(k) ?? 0) + 1; rows.set(k, n); return n; } });
    const seen: number[] = [];
    for (let i = 0; i < 7; i++) {
      m.resetRateLimits(); // every request on a fresh isolate
      const r = await m.takeRateLimit("personal-guide:x::/64", 6, 60_000, 1_000);
      seen.push(r.allowed ? r.remaining : -1);
    }
    m.setDurableCounterStore(null);
    expect(seen).toEqual([5, 4, 3, 2, 1, 0, -1]);
  });
});

describe("b12 H-12 saved report wording", () => {
  it("old BUY / ACCUMULATE labels read as neutral indicators at view time", async () => {
    const { neutraliseRatingWording, neutralRatingLabel, neutraliseReportStrings } = await import("@/lib/report-copy");
    const out = neutraliseRatingWording("ACCUMULATE FTNT. Buy or Accumulate rating on 3 names. SELL XYZ");
    expect(out).not.toMatch(/\b(buy|accumulate|sell|strong buy)\b/i);
    expect(neutralRatingLabel("ACCUMULATE")).toBe("Positive signal");
    const deep = neutraliseReportStrings({ action: "BUY", note: "BUY NOW" });
    expect(deep.action).toBe("BUY");
    expect(deep.note).not.toMatch(/\bbuy\b/i);
  });
});

describe("b12 G-17 coin universe", () => {
  it("drops tokenised stocks and wrapped/bridged/staked duplicates", async () => {
    const { isDuplicateOrTokenisedCoin, coinDepthComplete } = await import("@/lib/coin-junk");
    for (const id of ["meta-coinbase-tokenized-stock", "binance-bridged-usdt-bnb-smart-chain", "circle-wrapped-btc", "l2-standard-bridged-weth-base", "lido-staked-ether", "weth", "wrapped-bitcoin", "wrapped-liquid-staked-ether-20"])
      expect(isDuplicateOrTokenisedCoin(id)).toBe(true);
    for (const id of ["bitcoin", "ethereum", "tether", "solana"]) expect(isDuplicateOrTokenisedCoin(id)).toBe(false);
    expect(coinDepthComplete({ marketCap: 1, volume24h: 1, circulatingSupply: 1, change1h: 0 })).toBe(true);
    expect(coinDepthComplete({ marketCap: 1, volume24h: 1, circulatingSupply: null, change1h: 0 })).toBe(false);
  });
});

describe("b12 G-10 / G-14 / H-4", () => {
  it("optimistic confirm, labelled avatar, quota endpoint", () => {
    expect(read("src/components/dashboard/RecordTransactionPanel.tsx")).toContain("optimisticRollback: true");
    expect(read("src/lib/confirm-ledger.ts")).toContain("_optimistic");
    expect(read("src/components/TopNav.tsx")).toContain("account menu`}"); // b73: name now starts with the visible initials
    expect(read("src/app/api/reports/quota/route.ts")).toContain("countFreeReportsThisMonth");
  });
});
