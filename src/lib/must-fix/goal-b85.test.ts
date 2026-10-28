/**
 * b85 batch 1. pull-check:v3-b89-2026-10-29
 * Worked NZ examples are hand-checked; indicative, not tax advice. No GST.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceLabel } from "@/lib/crypto-price-chain";
import { publicCoinSourceLine } from "@/lib/data-sources";
import { AI_DISCLAIMER_DATA_SENTENCE, AI_PROVIDER_API_SENTENCE } from "@/lib/ai-provider-disclosure";
import { AI_REQUEST_LINES } from "@/lib/public-copy";

const read = (p: string) => readFileSync(p, "utf8");

describe("b85 pins", () => {
  it("pins the build", () => {
    expect(read("public/build-version.txt").trim()).toBe("v3-b89-2026-10-29");
    expect(read("qa/PULL-CHECK-2026-10-12.md")).toContain("pull-check:v3-b89-2026-10-29");
  });
});

describe("b85 (a) polish", () => {
  it("names CoinPaprika in the source line", () => {
    expect(sourceLabel("coinpaprika")).toBe("CoinPaprika");
    expect(publicCoinSourceLine("coinpaprika,yahoo,coingecko")).toBe("Price source: CoinPaprika, Yahoo Finance, CoinGecko. Quotes can be delayed.");
  });
  it("/settings offers one next step only, never legacy plans", () => {
    const s = read("src/components/settings/SettingsClient.tsx");
    expect(s).toContain('p.key === `pro_${nextIntervalSuffix}`');
    expect(s).toContain('currentTier === "pro"');
    expect(s).not.toContain('(p.priceId || p.key.startsWith("starter_") || p.key.startsWith("pro_"))');
  });
  it("skip link and footer links are 44px on phones", () => {
    expect(read("src/app/layout.tsx")).toMatch(/inline-flex min-h-11 items-center[^"]*"[\s\S]{0,40}Skip to content/);
    expect(read("src/components/SiteFooter.tsx")).toContain("md:min-h-0 min-w-11 justify-center md:min-w-0");
  });
});

describe("b85 K-12: each AI disclosure sentence on both pages, plain visible text", () => {
  const trust = read("src/app/trust/page.tsx");
  const ai = read("src/app/ai-disclaimer/page.tsx");
  it("API and data sentences on both", () => {
    for (const page of [trust, ai]) {
      expect(page).toContain("{AI_PROVIDER_API_SENTENCE}");
      expect(page).toContain("{AI_DISCLAIMER_DATA_SENTENCE}");
      expect(page).toContain("AI_REQUEST_LINES.map");
      expect(page).not.toMatch(/<details|CollapsibleSection/);
    }
  });
  it("sentences use straight quotes only", () => {
    for (const s of [AI_PROVIDER_API_SENTENCE, AI_DISCLAIMER_DATA_SENTENCE, ...AI_REQUEST_LINES]) expect(s).not.toMatch(/[\u2018\u2019\u201c\u201d]/);
  });
});

describe("b85 BS-01 IBKR preview (fixture only)", () => {
  it("GET preview on the allow-listed hook, no write, no token, no new cron file", () => {
    const r = read("src/app/api/test-hooks/ibkr-fixture-sync/route.ts");
    expect(r).toContain("export async function GET()");
    expect(r).toContain('action: "preview"');
    expect(r).toContain("testHooksAllowedFor");
    expect(r.split("export async function GET()")[1]).not.toContain("applyFlexStatement");
  });
});

describe("b85 H-10 Sharesies and Hatch fixtures + preview paths", () => {
  const dir = "src/lib/fixtures/broker-import/";
  it("each broker has a fixture and an expected.json matching expected-totals.json", () => {
    const totals = JSON.parse(readFileSync(dir + "expected-totals.json", "utf8"));
    for (const b of ["sharesies", "hatch"]) {
      expect(readFileSync(dir + `${b}.csv`, "utf8").length).toBeGreaterThan(0);
      const exp = JSON.parse(readFileSync(dir + `${b}.expected.json`, "utf8"));
      expect({ broker: exp.broker, rows: exp.rows, cashNzd: exp.cashNzd }).toEqual(totals[`${b}.csv`]);
    }
    expect(totals["bad-rows.csv"].errors).toBe(3);
  });
  it("embedded preview fixtures equal the csv files", async () => {
    const m = await import("@/lib/fixtures/broker-import/preview-fixtures");
    // b86: the hook fixtures moved to the H-10 engine's own layouts (src/lib/import/fixtures).
    const h10 = "src/lib/import/fixtures/";
    expect(m.SHARESIES_FIXTURE).toBe(readFileSync(h10 + "sharesies.csv", "utf8"));
    expect(m.HATCH_FIXTURE).toBe(readFileSync(h10 + "hatch.csv", "utf8"));
    expect(m.BAD_ROWS_FIXTURE).toBe(readFileSync(h10 + "bad-rows.csv", "utf8"));
  });
  it("preview hook is allow-listed, preview-only and covers oversize + bad-rows", () => {
    const src = readFileSync("src/app/api/test-hooks/import-preview/route.ts", "utf8");
    expect(src).toContain("testHooksAllowedFor");
    expect(src).toContain('action: "preview"');
    expect(src).toMatch(/oversize: \(\) =>/);
    expect(src).toContain('"bad-rows"');
    expect(src).not.toMatch(/Math\.random|createItem|\.create\(/);
  });
});

describe("b85 H-9 FIF cost includes buy fees (TT bl28 ledger, to the cent)", () => {
  // Ledger rows copied from TT's PRO_H9TAX test account export (bl28/pro_h9tax-tx.json); ids dropped.
  const rows = [{"type": "correction", "ticker": "MSFT", "asset_type": "stock", "asset_name": "Microsoft", "quantity": 80, "price": 200.0625, "fees": 0, "total": 0, "currency": "USD", "notes": "Correction: 40 at US$400.13 \u2192 80 at US$200.06. Cash unchanged. Note: [SPLIT:r=2;d=2026-09-01] Share split 2:1", "executed_at": "2026-08-31T11:00:00.000Z"}, {"type": "dividend", "ticker": "AAPL", "asset_type": "stock", "asset_name": "Dividend", "quantity": 25, "price": 1, "fees": 0, "total": 0, "currency": "USD", "fx_rate": 1.7, "notes": "[DIV:g=42.50;i=0.00;w=6.38;d=36.13;fx=1.7000;ccy=USD;ng=25.00;nw=3.75;nd=21.25;sh=0.1]", "executed_at": "2026-08-15T00:00:00.000Z"}, {"type": "buy", "ticker": "MSFT", "asset_type": "stock", "asset_name": "Microsoft", "quantity": 40, "price": 400, "fees": 5, "total": -27528.6, "currency": "USD", "fx_rate": 1.72, "notes": "pxat=2026-10-21T23:57:52.487Z [audit 22 Oct 2026, 12:57 pm] FILLED buy qty=40 fill=400 USD live=532.95  source=user_fill. AetherForge does not execute trades. Fill prices must match your broker.", "executed_at": "2026-06-01T00:00:00.000Z"}, {"type": "buy", "ticker": "BHP.AX", "asset_type": "stock", "asset_name": "BHP Group", "quantity": 100, "price": 45, "fees": 10, "total": -5474.24, "currency": "AUD", "fx_rate": 1.2138, "notes": "pxat=2026-10-21T23:57:51.408Z [audit 22 Oct 2026, 12:57 pm] FILLED buy qty=100 fill=45 AUD live=57.77  source=user_fill. AetherForge does not execute trades. Fill prices must match your broker.", "executed_at": "2026-05-10T00:00:00.000Z"}, {"type": "buy", "ticker": "AAPL", "asset_type": "stock", "asset_name": "Apple Inc", "quantity": 100, "price": 200, "fees": 5, "total": -34008.5, "currency": "USD", "fx_rate": 1.7, "notes": "pxat=2026-10-21T23:57:50.400Z [audit 22 Oct 2026, 12:57 pm] FILLED buy qty=100 fill=200 USD live=343.99  source=user_fill. AetherForge does not execute trades. Fill prices must match your broker.", "executed_at": "2026-04-15T00:00:00.000Z"}, {"type": "opening_balance", "asset_type": "cash", "asset_name": "Opening balance", "quantity": 150000, "price": 1, "fees": 0, "total": 150000, "currency": "NZD", "executed_at": "2026-03-31T23:00:00.000Z"}] as unknown as import("@/lib/taxable-income").TaxLedgerRow[];
  it("AAPL 34,044.63, MSFT 27,528.60, BHP 5,474.24 with fees in cost", async () => {
    const { buildFifPaper, buyFeesNzd } = await import("@/lib/fif-working-paper");
    const { drpLotsFromRows } = await import("@/lib/dividend-ledger");
    const { applyLedgerSplits } = await import("@/lib/stock-split");
    // Same row prep as loadTaxRows (DRP lots + splits).
    const prepared = applyLedgerSplits([...rows, ...drpLotsFromRows(rows as never)]);
    const paper = buildFifPaper({ rows: prepared, markets: [], endingYear: 2027 });
    const by = Object.fromEntries([...paper.attributing, ...paper.australian].map((p) => [p.ticker, p]));
    expect(by["AAPL"].costNzd).toBe(34044.63);
    expect(by["MSFT"].costNzd).toBe(27528.6);
    expect(by["MSFT"].costsInYearNzd).toBe(27528.6); // comparative-value costs move with cost
    expect(buyFeesNzd({ fees: 10 }, 1.2138) + 100 * 45 * 1.2138).toBeCloseTo(5474.24, 2);
    expect(by["BHP.AX"].costNzd).toBe(5474.24);
  });
});

describe("b85 H-10 commit: deposit credited before buys, all or nothing, stranded deposit removable", () => {
  it("a failed commit unwinds every saved row (deposit included), newest first", async () => {
    const { commitImportInOrder } = await import("@/lib/import-commit");
    const log: string[] = [];
    let cash = 0;
    const steps = [
      { kind: "deposit" as const, date: "2026-03-01", line: 0, amountNzd: 664.95 },
      { kind: "trade" as const, date: "2026-03-02", line: 2 },
      { kind: "trade" as const, date: "2026-03-03", line: 3 },
    ];
    const out = await commitImportInOrder(steps as never, {
      writeTrade: async (step: { kind: string; line: number }) => {
        if (step.line === 3) throw new Error("This would take cash below zero.");
        const prev = cash;
        const next = step.kind === "deposit" ? prev + 664.95 : prev - 504.9;
        log.push(`write ${step.kind}${step.line}`);
        return { id: `id${step.line}`, pendingCash: next, previousCash: prev };
      },
      writeCash: async (_s: unknown, t: { pendingCash: number }) => { cash = t.pendingCash; },
      rollbackTrade: async (t: { id: string; previousCash: number }) => { log.push(`undo ${t.id}`); cash = t.previousCash; },
    } as never);
    expect(out.error).toMatch(/below zero/);
    expect(out.written).toEqual([]);
    expect(log).toEqual(["write deposit0", "write trade2", "undo id2", "undo id0"]);
    expect(cash).toBe(0);
  });
  it("the import route credits the session cash after each write, so a buy sees the deposit", () => {
    const route = readFileSync("src/app/api/import/route.ts", "utf8");
    expect(route).toContain("syncSessionCash(user, trade.pendingCash);");
    expect(route).toContain("syncSessionCash(user, trade.previousCash);");
    expect(route).toContain("written.length = 0;");
    const persist = readFileSync("src/lib/import/persist.ts", "utf8");
    expect(persist).toContain("setCash(saved.pendingCash);");
    expect((persist.match(/await unwind\(\);/g) || []).length).toBe(3);
  });
  it("a stranded import deposit (no buy or sell left in its batch) is removable", async () => {
    const { strandedImportDeposit } = await import("@/lib/import-stranded");
    const dep = { _id: "d1", type: "deposit", notes: "Paper cash of NZ$685.10 is recorded because this buy would otherwise make paper cash negative. batch=imp9e40e7680ed9865d" };
    expect(strandedImportDeposit(dep, [dep])).toBe(true);
    expect(strandedImportDeposit(dep, [dep, { _id: "b1", type: "buy", notes: "Imported batch=imp9e40e7680ed9865d" }])).toBe(false);
    expect(strandedImportDeposit({ ...dep, notes: "Manual deposit" }, [])).toBe(false);
    const src = readFileSync("src/lib/ledger-reversal-apply.ts", "utf8");
    expect(src).toContain("if (cashAfter < -0.009 && strandedImportDeposit(target, transactions)) cashAfter = round2(cashBefore);");
  });
  it("bad-rows.csv preview lists 3 row errors", async () => {
    const { planBrokerImport, importRowErrors } = await import("@/lib/broker-import");
    const plan = await planBrokerImport(readFileSync("src/lib/fixtures/broker-import/bad-rows.csv", "utf8"), { openingCashNzd: 0 } as never);
    expect(importRowErrors(plan).map((e) => e.line)).toEqual([3, 4, 5]);
    expect(readFileSync("src/app/api/import/route.ts", "utf8")).toContain("errors: importRowErrors(plan),");
  });
});

describe("b85 CR-7 ended subscriptions go to Free", () => {
  const now = Date.UTC(2026, 9, 28) ;
  const sep13 = Date.UTC(2026, 8, 13) / 1000;
  it("canceled, unpaid, incomplete_expired and a passed cancel_at_period_end are ended; canceling-at-period-end before the end is not", async () => {
    const { subscriptionEnded } = await import("@/lib/stripe-entitlement");
    for (const status of ["canceled", "unpaid", "incomplete_expired"]) expect(subscriptionEnded({ status }, now)).toBe(true);
    expect(subscriptionEnded({ status: "active", cancel_at_period_end: true, current_period_end: sep13 }, now)).toBe(true);
    expect(subscriptionEnded({ status: "active", cancel_at_period_end: true, current_period_end: now / 1000 + 86400 }, now)).toBe(false);
    expect(subscriptionEnded({ status: "active", current_period_end: sep13 }, now)).toBe(false); // renewing, not ended
    expect(subscriptionEnded({ status: "past_due" }, now)).toBe(false);
  });
  it("the ended patch is Free + canceled and identical on replay", async () => {
    const { endedPatch } = await import("@/lib/stripe-entitlement");
    const a = endedPatch("cus_test");
    expect(a).toMatchObject({ subscription_status: "canceled", subscription_plan: "none", bot_access: "none" });
    expect(endedPatch("cus_test")).toEqual(a);
  });
  it("webhook: deleted and updated resolve the user via metadata, customer, then the Checkout Session; unresolved is a 500 for retry", () => {
    const src = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
    expect(src).toContain("checkout.sessions.list({ subscription: subscription.id, limit: 1 })");
    expect(src).toContain("parsePaymentLinkRef(session.client_reference_id).userId");
    expect(src).toContain("throw new Error(`No user found for deleted subscription");
    expect(src).toContain("throw new Error(`No user found for subscription");
    expect(src).toContain("if (subscriptionEnded(subscription as never)) {");
    expect((src.match(/await otherLiveSubscription\(subscription\)/g) || []).length).toBe(2);
    expect(src).toContain('case "customer.subscription.deleted"');
    expect(src).toContain('case "customer.subscription.updated"');
  });
});
