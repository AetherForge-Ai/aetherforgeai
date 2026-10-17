/**
 * Goal loop batch b8 (GOAL-LOCK items CR-2 CR-5 H-5 CR-6 CR-1 H-13 H-10 H-9 M-6 M-3 G-01 G-02).
 * pull-check:v3-goal-b8-2026-10-17
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  AUTH_IP_SIGN_IN_LIMIT,
  authRateLimitRule,
  rateLimitHeaders,
  resetRateLimits,
  setDurableCounterStore,
  takeRateLimit,
  PERSONAL_GUIDE_LIMIT,
  PERSONAL_GUIDE_WINDOW_MS,
} from "@/lib/ip-rate-limit";
import { enforcedCsp, makeCspNonce, nonceCsp, SECURITY_HEADERS, STATIC_SECURITY_HEADERS } from "@/lib/security-headers";
import { aiProviderHealth, aiProviderStatusLine, resetAiProviderHealth } from "@/lib/ai-provider-health";
import { planLedgerReversal } from "@/lib/ledger-reversal";
import { entitlementPatch } from "@/lib/stripe-entitlement";
import { planByKey, publicCheckoutPriceIds } from "@/lib/plans";
import { publicPriceSlot } from "@/lib/public-catalog";
import { isNewsRelevant } from "@/lib/market-news";
import { planBrokerImport } from "@/lib/broker-import";
import { importFileHash, notesHaveFile, stampFileHash } from "@/lib/import-commit";
import { importFileProblem } from "@/lib/import-limits";
import { buildFifPaper, fifThresholdSentence } from "@/lib/fif-working-paper";
import { realisedByTaxYear } from "@/lib/tax-realised";
import { drpLotRow, splitAdjustedRows } from "@/lib/tax-scenarios";
import { fifPaperLines, taxPaperPdf, taxYearSpan } from "@/lib/tax-pack";
import {
  buildDividendRecord,
  dividendCsv,
  dividendIncome,
  drpLotsFromRows,
  parseDividendNotes,
  summariseDividends,
  withDividendNotes,
  type DividendView,
} from "@/lib/dividend-ledger";
import { performanceReport, solveXirr, timeWeightedReturn } from "@/lib/performance-math";

const read = (p: string) => readFileSync(p, "utf8");

describe("CR-2 guide limit", () => {
  beforeEach(() => {
    resetRateLimits();
    setDurableCounterStore(null);
  });
  it("7th POST from one IP in 60 s is refused with Retry-After, and the count decrements", async () => {
    const now = Date.UTC(2026, 9, 17, 7, 0, 5);
    const seen: number[] = [];
    let last = null as Awaited<ReturnType<typeof takeRateLimit>> | null;
    for (let i = 0; i < 7; i++) {
      last = await takeRateLimit("guide:203.0.113.7", PERSONAL_GUIDE_LIMIT, PERSONAL_GUIDE_WINDOW_MS, now + i);
      seen.push(last.remaining);
    }
    expect(seen.slice(0, 6)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(last!.allowed).toBe(false);
    const h = rateLimitHeaders(last!, true);
    expect(Number(h["Retry-After"])).toBeGreaterThan(0);
    expect(h["X-RateLimit-Remaining"]).toBe("0");
    expect(h["X-RateLimit-Key"]).toMatch(/^[0-9a-f]{8}$/);
  });
  it("a durable store that undercounts no longer wins: the highest count refuses", async () => {
    setDurableCounterStore({ increment: async () => 1 });
    const now = Date.UTC(2026, 9, 17, 7, 1, 0);
    let refused = 0;
    for (let i = 0; i < 8; i++) {
      const r = await takeRateLimit("guide:198.51.100.9", PERSONAL_GUIDE_LIMIT, PERSONAL_GUIDE_WINDOW_MS, now + i);
      if (!r.allowed) refused++;
    }
    expect(refused).toBe(2);
  });
  it("/status shows the AI provider state with only a reason code (K-10)", async () => {
    resetAiProviderHealth();
    const fake = (async () => new Response("forbidden", { status: 403 })) as unknown as typeof fetch;
    const h = await aiProviderHealth(fake, Date.UTC(2026, 9, 17, 7, 0, 0), "test-key");
    expect(h).toMatchObject({ state: "unavailable", code: "http_403" });
    const line = aiProviderStatusLine(h);
    expect(line.body).toContain("Unavailable (http_403)");
    expect(line.body).not.toContain("test-key");
    expect(read("src/app/status/page.tsx")).toContain("AI guide provider");
  });
});

describe("CR-5 login limit and CSP", () => {
  beforeEach(() => resetRateLimits());
  it("20 failed logins from one IP across different emails in 5 min see 429", async () => {
    const rule = authRateLimitRule("/api/auth/sign-in/email")!;
    expect(rule.ipLimit).toBe(AUTH_IP_SIGN_IN_LIMIT);
    const now = Date.UTC(2026, 9, 17, 7, 0, 0);
    let refused = 0;
    for (let i = 0; i < 20; i++) {
      const r = await takeRateLimit("auth:sign-in:ip:203.0.113.20", rule.ipLimit, rule.windowMs, now + i * 1000);
      if (!r.allowed) refused++;
    }
    expect(refused).toBe(20 - AUTH_IP_SIGN_IN_LIMIT);
    expect(read("src/app/api/auth/[...all]/route.ts")).toContain("rule.ipLimit");
    expect(read("src/lib/auth.ts")).toContain('"/forget-password": { window: 300, max: 5 }');
  });
  it("script-src uses a per-request nonce with strict-dynamic and no 'unsafe-inline'", () => {
    const a = makeCspNonce();
    const b = makeCspNonce();
    expect(a).not.toBe(b);
    const csp = nonceCsp(a);
    expect(csp).toContain(`'nonce-${a}'`);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("totalum-frontend-test");
    expect(enforcedCsp(false)).not.toContain("unsafe-inline");
    expect(SECURITY_HEADERS["Content-Security-Policy"]).not.toContain("unsafe-inline");
    expect(STATIC_SECURITY_HEADERS["Content-Security-Policy"]).toBeUndefined();
    const mw = read("src/middleware.ts");
    expect(mw).toContain('requestHeaders.set("content-security-policy", csp)');
    expect(mw).toContain('requestHeaders.set("x-nonce", nonce)');
    expect(read("src/app/layout.tsx")).toContain('strategy="beforeInteractive" nonce={nonce}');
    expect(read("src/components/GoogleTag.tsx")).toContain("nonce={nonce}");
    expect(read("src/app/docs/[slug]/page.tsx")).toContain('dynamic = "force-dynamic"');
  });
});

describe("H-5 dividends", () => {
  it("two identical dividends: deleting one reverses exactly one amount of cash", () => {
    const div = (id: string) => ({ _id: id, type: "dividend", ticker: "FPH.NZ", asset_type: "stock", cash_nzd: 15, total: 15, executed_at: "2026-10-14T00:00:00.000Z" });
    const rows = [div("d1"), div("d2")];
    const plan = planLedgerReversal("user-qa", rows[0], rows, null);
    expect(plan.cashDeltaNzd).toBeCloseTo(-15, 2);
    const remaining = rows.filter((r) => r._id !== "d1");
    expect(remaining.map((r) => r._id)).toEqual(["d2"]);
  });
  it("delete is idempotent and the button ignores clicks while pending", () => {
    const route = read("src/app/api/transactions/route.ts");
    expect(route).toContain("alreadyRemoved: true");
    expect(route).toContain("DUPLICATE_DIVIDEND_CODE");
    const tab = read("src/components/dashboard/TransactionsTab.tsx");
    expect(tab).toContain("if (!pending || busy) return;");
    expect(tab).toContain("removedIds.has(line.id)");
  });
});

describe("CR-6 / CR-1 Stripe", () => {
  it("Starter sets the 25-holding cap; cancel at period end keeps it until deleted; deleted is Free", () => {
    const starter = planByKey("starter_monthly");
    expect(starter?.tickerLimit).toBe(25);
    const active = entitlementPatch({ stripeStatus: "active", plan: starter });
    expect(active).toMatchObject({ subscription_plan: "starter_monthly", ticker_limit: 25 });
    // cancel_at_period_end keeps status active until Stripe sends deleted at period end.
    expect(entitlementPatch({ stripeStatus: "active", plan: starter }).ticker_limit).toBe(25);
    expect(entitlementPatch({ stripeStatus: "canceled", plan: undefined })).toMatchObject({ subscription_plan: "none", ticker_limit: 10 });
    // A replay writes the same patch again: no change.
    expect(entitlementPatch({ stripeStatus: "active", plan: starter })).toEqual(active);
  });
  it("Free 11th holding via the transactions and import APIs is a 403", () => {
    expect(read("src/app/api/transactions/route.ts")).toContain("holdingCapRefusal");
    expect(read("src/app/api/import/route.ts")).toContain("importCapRefusal");
  });
  it("public price set: at most 6 ids, no Apex, Starter monthly is NZ$16.00; test mode echoes the price", () => {
    const ids = publicCheckoutPriceIds();
    expect(ids.length).toBeLessThanOrEqual(6);
    expect(publicPriceSlot("starter_monthly")?.unitAmount).toBe(1600);
    expect(planByKey("starter_monthly")?.price).toBe(16);
    const checkout = read("src/app/api/stripe/checkout/route.ts");
    expect(checkout).toContain("session.livemode === false");
    expect(checkout).toContain("[stripe-test]");
  });
});

describe("H-13 news", () => {
  it("rejects the BLS CPI and Palantir headlines; keeps NZ/AU items; honest empty state", () => {
    expect(isNewsRelevant({ headline: "BLS has scheduled the September 2026 CPI release", market: "Global" })).toBe(false);
    expect(isNewsRelevant({ headline: "Why You Should Think About Palantir Differently Now", market: "Global" })).toBe(false);
    expect(isNewsRelevant({ headline: "RBNZ Official Cash Rate is 2.75%", market: "NZX" })).toBe(true);
    expect(read("src/components/dashboard/MarketNewsPageContent.tsx")).toContain("No NZ/AU market news in the last 24 h.");
  });
});

describe("H-10 broker import", () => {
  const fx = (name: string) => read(`src/lib/fixtures/broker-import/${name}`);
  const expected = JSON.parse(fx("expected-totals.json")) as Record<string, { broker: string; rows: number; cashNzd: number; errors?: number }>;
  for (const [file, want] of Object.entries(expected)) {
    if (file.startsWith("_")) continue;
    it(`${file} commits to the expected NZ$ total within NZ$0.01`, () => {
      const plan = planBrokerImport(fx(file), { openingCashNzd: 100000 });
      expect(plan.broker).toBe(want.broker);
      expect(plan.toWrite.length).toBe(want.rows);
      const cash = plan.toWrite.reduce((s, r) => s + r.cashEffectNzd, 0);
      expect(Math.abs(cash - want.cashNzd)).toBeLessThan(0.01);
      if (want.errors != null) expect(plan.unsupported.length).toBe(want.errors);
    });
  }
  it("the same file twice is flagged by its SHA-256 file stamp; a second upload's rows are all duplicates", async () => {
    const text = fx("asb.csv");
    const hash = await importFileHash(text);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(await importFileHash(text.replace(/\n/g, "\r\n"))).toBe(hash);
    expect(notesHaveFile(stampFileHash("Imported batch=imp1", hash), hash)).toBe(true);
    const first = planBrokerImport(text, { openingCashNzd: 100000 });
    const { importDuplicateKey } = await import("@/lib/broker-import");
    const again = planBrokerImport(text, { openingCashNzd: 100000, existingKeys: first.toWrite.map(importDuplicateKey) });
    expect(again.toWrite.length).toBe(0);
    expect(again.duplicates.length).toBe(3);
    expect(read("src/app/api/import/route.ts")).toContain("IMPORT_DUPLICATE_FILE");
  });
  it("6 MB file is rejected before parsing; no Math.random in import code", () => {
    expect(importFileProblem({ size: 6 * 1024 * 1024, type: "text/csv", name: "big.csv" })).toMatch(/5 MB/);
    for (const f of ["src/lib/import-commit.ts", "src/lib/broker-import.ts", "src/app/api/import/route.ts"]) {
      expect(read(f)).not.toContain("Math.random");
    }
  });
});

describe("H-9 golden tax scenarios (src/lib/fixtures/tax-golden.md)", () => {
  const r = (o: Record<string, unknown>) => ({ fees: 0, asset_type: "stock", ...o, trade_date: o.executed_at }) as never;
  it("1: under NZ$50k cost states the exemption", () => {
    const p = buildFifPaper({ rows: [r({ _id: "1", type: "buy", ticker: "AAPL", quantity: 100, price: 150, fx_rate: 1.6, currency: "USD", executed_at: "2025-05-01" })], markets: [], endingYear: 2026 });
    expect(p.peakCostNzd).toBe(24000);
    expect(fifThresholdSentence(p)).toContain("under NZ$50,000.00");
  });
  it("2: over NZ$50k with FDR < CV", () => {
    const p = buildFifPaper({ rows: [r({ _id: "2", type: "buy", ticker: "MSFT", quantity: 200, price: 200, fx_rate: 1.6, currency: "USD", executed_at: "2024-06-01" })], markets: [{ ticker: "MSFT", openingNzd: 70000, closingNzd: 90000 }], endingYear: 2026 });
    expect(p.peakCostNzd).toBe(64000);
    expect(p.threshold).toBe("over");
    expect(p.attributing[0].fdrNzd).toBe(3500);
    expect(p.attributing[0].cvNzd).toBe(20000);
  });
  it("3: same-year buy and sell", () => {
    const rep = realisedByTaxYear([r({ _id: "3a", type: "buy", ticker: "NVDA", quantity: 10, price: 100, fx_rate: 1.6, currency: "USD", executed_at: "2025-06-01" }), r({ _id: "3b", type: "sell", ticker: "NVDA", quantity: 10, price: 120, fx_rate: 1.6, currency: "USD", executed_at: "2025-09-01" })], 2026);
    expect(rep.combinedNzd).toBe(320);
  });
  it("4: DRP at zero cost", () => {
    const rep = realisedByTaxYear([r({ _id: "4a", type: "buy", ticker: "FPH.NZ", quantity: 100, price: 30, fx_rate: 1, currency: "NZD", executed_at: "2025-05-01" }), drpLotRow({ ticker: "FPH.NZ", when: "2025-07-01", shares: 2, costNative: 0 }) as never, r({ _id: "4b", type: "sell", ticker: "FPH.NZ", quantity: 102, price: 32, fx_rate: 1, currency: "NZD", executed_at: "2025-10-01" })], 2026);
    expect(rep.blankCount).toBe(0);
    expect(rep.combinedNzd).toBe(264);
  });
  it("5: 2:1 split", () => {
    const rows = splitAdjustedRows([r({ _id: "5a", type: "buy", ticker: "SPK.NZ", quantity: 50, price: 6, fx_rate: 1, currency: "NZD", executed_at: "2025-05-01" }), r({ _id: "5b", type: "sell", ticker: "SPK.NZ", quantity: 60, price: 3.5, fx_rate: 1, currency: "NZD", executed_at: "2025-11-01" })], "SPK.NZ", "2025-08-01", 2);
    expect(realisedByTaxYear(rows, 2026).combinedNzd).toBe(30);
  });
  it("PDF has the disclaimer, the 1 Apr-31 Mar tax year and per-holding FX and values", () => {
    const rows = [r({ _id: "2", type: "buy", ticker: "MSFT", quantity: 200, price: 200, fx_rate: 1.6, currency: "USD", executed_at: "2024-06-01" })];
    const p = buildFifPaper({ rows, markets: [{ ticker: "MSFT", openingNzd: 70000, closingNzd: 90000 }], endingYear: 2026 });
    const pdf = taxPaperPdf({ title: "FIF working paper", taxYear: p.label, lines: fifPaperLines(p, rows), endingYear: 2026 });
    expect(pdf).toContain("Indicative, not tax advice");
    expect(pdf).toContain(taxYearSpan(2026));
    expect(taxYearSpan(2026)).toBe("Tax year 1 Apr 2025 to 31 Mar 2026");
    expect(pdf).toContain("MSFT: opening NZD 70000.00, closing NZD 90000.00");
    expect(pdf).toContain("FX NZD per unit 1.6000");
  });
});

describe("G-01 dividends ledger", () => {
  const view = (id: string, when: string, ticker: string, parts: ReturnType<typeof buildDividendRecord>): DividendView => {
    if (!parts.ok) throw new Error("bad");
    return { id, when, ticker, assetName: ticker, assetType: "stock", parts: parts.parts, cashNzd: parts.parts.netCashNzd };
  };
  const nz = buildDividendRecord({ grossNative: 100, imputationNzd: 38.89, withholdingNative: 0, drpNative: 0, currency: "NZD", fx: 1 });
  const us = buildDividendRecord({ grossNative: 50, imputationNzd: 0, withholdingNative: 7.5, drpNative: 0, currency: "USD", fx: 1.7 });
  const drp = buildDividendRecord({ grossNative: 60, imputationNzd: 0, withholdingNative: 0, drpNative: 60, currency: "NZD", fx: 1, drpShares: 2 });
  const rows = [view("a", "2026-03-31", "FPH.NZ", nz), view("b", "2026-04-01", "AAPL", us), view("c", "2026-05-10", "SPK.NZ", drp)];
  it("NZ imputed, US 15% withheld and DRP: cash and total return update", () => {
    expect(us.ok && us.parts.withholdingNzd).toBe(12.75);
    expect(us.ok && us.parts.netCashNzd).toBe(72.25);
    const inc = dividendIncome(rows, { asOf: "2026-06-30", costNzd: 10000, valueNzd: 12000 });
    expect(inc.cashNzd).toBe(172.25);
    expect(inc.totalReturnNzd).toBe(232.25);
    expect(inc.drp.map((d) => d.id)).toEqual(["c"]);
    expect(inc.yieldOnCost).toBeCloseTo(245 / 10000, 10);
    expect(inc.yieldOnValue).toBeCloseTo(245 / 12000, 10);
  });
  it("31 Mar and 1 Apr fall in different NZ tax years", () => {
    const years = dividendIncome(rows).years;
    expect(years.map((y) => [y.endingYear, y.grossNzd])).toEqual([[2026, 100], [2027, 145]]);
  });
  it("CSV totals = page totals", () => {
    const csv = dividendCsv(rows, (v) => v);
    const totalLine = csv.trim().split("\n").at(-1)!.split(",");
    const t = summariseDividends(rows);
    expect(Number(totalLine[5])).toBe(t.grossNzd);
    expect(Number(totalLine[6])).toBe(t.imputationNzd);
    expect(Number(totalLine[7])).toBe(t.withholdingNzd);
    expect(Number(totalLine[8])).toBe(t.drpNzd);
    expect(Number(totalLine[9])).toBe(t.netCashNzd);
  });
  it("DRP shares are stored and become a FIFO lot at the DRP amount", () => {
    if (!drp.ok) throw new Error("bad");
    const notes = withDividendNotes("", drp.parts);
    expect(parseDividendNotes(notes)?.drpShares).toBe(2);
    const lots = drpLotsFromRows([{ _id: "c", type: "dividend", ticker: "SPK.NZ", notes, executed_at: "2026-05-10" }]);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ type: "buy", quantity: 2, price: 30 });
    expect(drpLotsFromRows([{ _id: "x", type: "dividend", ticker: "FPH.NZ", notes: withDividendNotes("", (nz as { parts: never }).parts) }])).toHaveLength(0);
  });
});

describe("G-02 performance", () => {
  const lines = read("fixtures/perf-20-trades.csv").split("\n").filter((l) => l && !l.startsWith("#")).slice(1);
  const parsed = lines.map((l) => l.split(",")).map(([date, v, f]) => ({ date, valueBeforeNzd: Number(v), flowNzd: Number(f) }));
  const flows = parsed.slice(0, -1);
  const end = parsed.at(-1)!;
  const expected = Object.fromEntries(
    read("fixtures/perf-20-trades.expected.csv").split("\n").filter((l) => l && !l.startsWith("#")).slice(1).map((l) => l.split(",")).map(([k, v]) => [k, Number(v)])
  );
  it("20-flow golden file matches the independent calculation within 0.01%", () => {
    expect(flows).toHaveLength(20);
    const x = solveXirr([...flows.map((p) => ({ date: p.date, amountNzd: -p.flowNzd })), { date: end.date, amountNzd: end.valueBeforeNzd }]);
    expect(Math.abs((x! - expected.xirr) / expected.xirr)).toBeLessThan(0.0001);
    const t = timeWeightedReturn(flows, end.valueBeforeNzd, end.date);
    expect(Math.abs((t! - expected.twr) / expected.twr)).toBeLessThan(0.0001);
  });
  it("empty and one-trade books are handled, and every figure has as-of and source", () => {
    const empty = performanceReport({ points: [], endingNzd: null, asOf: "2026-10-17", source: "Paper cash balance" });
    expect(empty.xirr.value).toBeNull();
    expect(empty.xirr.reason).toBeTruthy();
    const one = performanceReport({ points: [{ date: "2026-10-01", valueBeforeNzd: 0, flowNzd: 1000 }], endingNzd: 1010, asOf: "2026-10-17", source: "Paper cash balance" });
    for (const f of [one.xirr, one.twr, ...Object.values(one.periods).flatMap((p) => [p.xirr, p.twr])]) {
      expect(f.asOf).toBe("2026-10-17");
      expect(f.source).toBe("Paper cash balance");
    }
    expect(one.twr.value).toBeCloseTo(0.01, 6);
    const page = read("src/app/my-returns/page.tsx");
    expect(page).toContain("NZDUSD=X");
    expect(page).toContain("^NZ50");
    expect(page).not.toMatch(/real-time|realtime/i);
  });
});
