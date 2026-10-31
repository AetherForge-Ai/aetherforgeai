// pull-check:v3-b90-2026-10-29
/** Goal b65 = Batch S2 (G-07, G-14, G-22, G-24). Locked text: BACKLOG.md "Re-rank Sat 24 Oct 2026". */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLANS } from "@/lib/plans";
import { enforcedCap, holdingCapsGrid, holdingsMeterText, NO_CARD_TRIAL_TEXT, REFUND_TEXT, trialPaymentCollection } from "@/lib/holding-caps";
import { usageMeterLabel } from "@/lib/dashboard-rail";
import { recoverFocusTarget, scrollRegionProps, trapTabTarget } from "@/lib/focus-trap";
import { cents, contributionsForYear, coupleNzSuperNetYear, formatNzd, rate } from "@/lib/kiwisaver";
import {
  G22_LABEL,
  employeeRateForYear,
  nzIncomeTax,
  nzSuperNetYearFor,
  pirFromTwoYears,
  planRange,
  prescribedInvestorRate,
  projectPlan,
  RANGE_RETURNS,
  retirementIncomeYear1,
  runWhatIfs,
  secondaryTaxCode,
} from "@/lib/kiwisaver-planner";
import { parsePastedTrades } from "@/lib/paste-import";
import { pasteAiMode, pasteAiNote, readMemberSwitch, writeMemberSwitch, PASTE_AI_STORAGE_KEY } from "@/lib/paste-ai-switch";

const read = (p: string) => readFileSync(p, "utf8");
const $ = (c: bigint) => formatNzd(c);

describe("b65 build", () => {
  it("build version", () => expect(read("public/build-version.txt").trim()).toBe("v3-b95-2026-11-01"));
});

describe("G-07 holding caps meter, no-card trial, refund text (flag OFF in prod)", () => {
  it("pricing grid and enforcement agree for every public plan", () => {
    const grid = holdingCapsGrid();
    expect(grid.map((r) => r.plan)).toEqual(["Free", "Starter", "Pro", "Ultimate"]);
    for (const r of grid) {
      const cap = enforcedCap(r.key);
      if (r.limit == null) expect(cap).toBeGreaterThanOrEqual(100000);
      else expect(cap).toBe(r.limit);
    }
    expect(grid.map((r) => r.label)).toEqual(["Up to 10 holdings", "Up to 25 holdings per bot", "Up to 75 holdings per bot", "Unlimited holdings"]);
  });
  it('meter reads "12 of 25 used" (new helper and the live rail agree)', () => {
    expect(holdingsMeterText(12, 25)).toBe("12 of 25 used");
    expect(usageMeterLabel(12, 25)).toBe("12 of 25 used");
    expect(holdingsMeterText(30, null)).toBe("30 used");
  });
  it("prices unchanged: NZ$0 / 16 / 49 / 199 a month, 160 / 490 / 1,990 a year", () => {
    expect(holdingCapsGrid().map((r) => r.monthlyNzd)).toEqual([0, 16, 49, 199]);
    const live = Object.fromEntries(PLANS.filter((p) => !p.archived).map((p) => [p.key, p.price]));
    expect(live).toMatchObject({ starter_monthly: 16, starter_yearly: 160, pro_monthly: 49, pro_yearly: 490, ultimate_monthly: 199, ultimate_yearly: 1990 });
  });
  it("flag OFF by default; OFF keeps card collection 'always'", () => {
    expect(read("src/lib/feature-flags.ts")).toContain('HOLDING_CAPS_V2 = on("HOLDING_CAPS_V2")');
    expect(trialPaymentCollection(false, true)).toBe("always");
    expect(trialPaymentCollection(true, false)).toBe("always");
    expect(trialPaymentCollection(true, true)).toBe("if_required");
    expect(read("src/app/pricing/page.tsx")).toContain("{HOLDING_CAPS_V2 ? <HoldingCapsGrid /> : null}");
  });
  it("refund text is the published /refunds policy, word for word", () => {
    expect(REFUND_TEXT).toContain("Monthly plans: you can cancel at any time");
    expect(REFUND_TEXT).toContain("Consumer Guarantees Act 1993");
    expect(NO_CARD_TRIAL_TEXT).toContain("no card needed");
  });
});

describe("G-14 Add-panel focus trap; keyboard on dashboard and tax", () => {
  const items = ["search", "qty", "price", "date", "save"];
  it("Tab from the last field wraps to the first; Shift+Tab from the first wraps to the last", () => {
    expect(trapTabTarget(items, "save", false, true)).toBe("search");
    expect(trapTabTarget(items, "search", true, true)).toBe("save");
    expect(trapTabTarget(items, "qty", false, true)).toBeNull();
  });
  it("40 Tabs never leave the panel (Tab 11 regression)", () => {
    let at: string = items[0];
    for (let i = 0; i < 40; i++) {
      const forced = trapTabTarget(items, at, false, true);
      at = forced ?? items[items.indexOf(at) + 1];
      expect(items).toContain(at);
    }
  });
  it("focus that escapes (native date segments) comes back to the next field", () => {
    expect(recoverFocusTarget(items, "date", false)).toBe("save");
    expect(recoverFocusTarget(items, "date", true)).toBe("price");
    expect(recoverFocusTarget(items, null, false)).toBe("search");
    expect(trapTabTarget(items, "outside", false, false)).toBe("search");
  });
  it("Add panel uses the shared trap and still returns focus to its opener", () => {
    const src = read("src/components/dashboard/TransactionDialog.tsx");
    expect(src).toContain("trapTabTarget(items, active, event.shiftKey");
    expect(src).toContain("recoverFocusTarget(items, lastInside, backwards)");
    expect(src).toContain("returnFocusRef");
  });
  it("scrollable tables on dashboard and tax are keyboard-focusable named regions", () => {
    expect(scrollRegionProps("Holdings table")).toEqual({ tabIndex: 0, role: "region", "aria-label": "Holdings table (scrolls sideways)" });
    for (const f of [
      "src/app/tax/income/page.tsx",
      "src/app/tax/realised/page.tsx",
      "src/components/tax/DividendLedgerView.tsx",
      "src/components/dashboard/UnifiedHoldingsTable.tsx",
      "src/components/dashboard/HoldingsOwnedTable.tsx",
      "src/components/dashboard/TransactionsTab.tsx",
      "src/components/dashboard/TransactionCenter.tsx",
      "src/components/dashboard/PreciousMetals.tsx",
      "src/components/dashboard/ProjectionsExplorer.tsx",
      "src/components/dashboard/PortfolioDashboard.tsx",
    ]) {
      const src = read(f);
      const bare = src.match(/className="[^"]*overflow-x-auto[^"]*">/g) ?? [];
      expect({ f, bare }).toEqual({ f, bare: [] });
    }
    expect(read("src/app/globals.css")).toContain('[role="region"][tabindex="0"]:focus-visible');
  });
});

describe("G-22 NZ goal planner: KiwiSaver, NZ Super, what-ifs, ranges (Illustrative, not financial advice)", () => {
  const base = { age: 30, openingBalance: cents("20000"), salary: cents("85000") };
  it("label", () => expect(G22_LABEL).toBe("Illustrative, not financial advice."));
  it("S1: $85,000 monthly, 3.5% each → $5,321.60 into the account; ESCT $889.20", () => {
    const y = contributionsForYear({ salary: cents("85000"), paysPerYear: 12, employeeRate: rate(35, 1000), employerRate: rate(35, 1000), esctThreshold: cents("87550") });
    expect($(y.esct)).toBe("$889.20");
    expect($(y.total)).toBe("$5,321.60");
  });
  it("S2 via the planner: $518,456.89 at 65; range $375,965.22 – $727,177.72; today's $259,242.76", () => {
    const r = planRange(base);
    expect([$(r.low), $(r.mid), $(r.high), $(r.midToday)]).toEqual(["$375,965.22", "$518,456.89", "$727,177.72", "$259,242.76"]);
    expect(r.years).toBe(35);
    const y = projectPlan({ ...base, netReturn: RANGE_RETURNS.mid }).years;
    expect($(y[0].closing)).toBe("$26,118.22");
    expect($(y[2].closing)).toBe("$39,821.14");
  });
  it("S3: couple NZ Super net (M) $44,412.16 a year; S3b with 4% draw = $65,150.44", () => {
    expect($(coupleNzSuperNetYear())).toBe("$44,412.16");
    expect($(nzSuperNetYearFor("couple-both"))).toBe("$44,412.16");
    expect($(nzSuperNetYearFor("single-alone"))).toBe("$28,867.80");
    expect($(nzSuperNetYearFor("single-sharing"))).toBe("$26,647.40");
    expect($(retirementIncomeYear1("couple-both", cents("518456.89")).total)).toBe("$65,150.44");
  });
  it("what-ifs move the right way and the default never drops below 4% from 2028", () => {
    const w = Object.fromEntries(runWhatIfs(base).map((x) => [x.id, x]));
    for (const id of ["rate6", "extra1000", "retire67", "growth2"]) expect(w[id].vsBase > BigInt(0)).toBe(true);
    expect(w.retire67.years).toBe(37);
    expect(employeeRateForYear(35, 2)).toEqual(rate(4, 100));
    expect(employeeRateForYear(60, 0)).toEqual(rate(60, 1000));
    for (const x of Object.values(w)) expect(x.low < x.mid && x.mid < x.high).toBe(true);
  });
  it("no government contribution over $180,000 or from 65", () => {
    const hi = projectPlan({ age: 40, openingBalance: BigInt(0), salary: cents("180000.01"), netReturn: rate(0, 1) });
    expect(hi.years.every((y) => y.government === BigInt(0))).toBe(true);
    const late = projectPlan({ age: 64, retireAge: 66, openingBalance: BigInt(0), salary: cents("50000"), netReturn: rate(0, 1) });
    expect(late.years[1].government).toBe(BigInt(0));
    expect(late.years[1].employerNet).toBe(BigInt(0));
  });
});

describe("G-22 NZ tax unit tests (IRD rates from 1 Apr 2025)", () => {
  it("income tax by band", () => {
    expect($(nzIncomeTax(cents("25591.28")))).toBe("$3,386.47"); // S3 annual check
    expect($(nzIncomeTax(cents("15600")))).toBe("$1,638.00");
    expect($(nzIncomeTax(cents("53500")))).toBe("$8,270.50");
    expect($(nzIncomeTax(cents("78100")))).toBe("$15,650.50");
    expect($(nzIncomeTax(cents("180000")))).toBe("$49,277.50");
    expect($(nzIncomeTax(cents("200000")))).toBe("$57,077.50");
    expect(nzIncomeTax(BigInt(0))).toBe(BigInt(0));
  });
  it("secondary tax codes", () => {
    expect(secondaryTaxCode(cents("15600")).code).toBe("SB");
    expect(secondaryTaxCode(cents("53500")).code).toBe("S");
    expect(secondaryTaxCode(cents("78100")).code).toBe("SH");
    expect(secondaryTaxCode(cents("180000")).code).toBe("ST");
    expect(secondaryTaxCode(cents("180000.01")).code).toBe("SA");
  });
  it("PIR (K9) and the lower of the last two years", () => {
    expect(prescribedInvestorRate(cents("15600"), cents("53500"))).toEqual(rate(105, 1000));
    expect(prescribedInvestorRate(cents("53500"), cents("78100"))).toEqual(rate(175, 1000));
    expect(prescribedInvestorRate(cents("53500.01"), cents("60000"))).toEqual(rate(28, 100));
    expect(pirFromTwoYears([{ taxable: cents("90000"), taxablePlusPie: cents("95000") }, { taxable: cents("40000"), taxablePlusPie: cents("45000") }])).toEqual(rate(175, 1000));
  });
  it("schema file only for goal_plan (no runtime reads/writes yet)", () => {
    const s = JSON.parse(read("qa/schema/g22-goal-plan.json"));
    expect(s.table).toBe("goal_plan");
    expect(s.fields.map((f: { name: string }) => f.name)).toContain("user");
  });
});

describe("G-24 paste-anything import: review screen + AI-off switch", () => {
  it("AI is used only when the site flag AND the member switch are on; default OFF", () => {
    expect(pasteAiMode(false, true)).toBe("rules-only");
    expect(pasteAiMode(true, false)).toBe("rules-only");
    expect(pasteAiMode(true, true)).toBe("ai-assisted");
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(readMemberSwitch(st)).toBe(false);
    writeMemberSwitch(st, true);
    expect(mem.get(PASTE_AI_STORAGE_KEY)).toBe("on");
    expect(readMemberSwitch(st)).toBe(true);
    writeMemberSwitch(st, false);
    expect(readMemberSwitch(st)).toBe(false);
    expect(readMemberSwitch(null)).toBe(false);
    expect(pasteAiNote(false, true)).toContain("not sent anywhere");
  });
  it("the switch is a real, labelled switch in the paste box; review before save remains", () => {
    const src = read("src/components/import/PasteTradesBox.tsx");
    expect(src).toContain('role="switch"');
    expect(src).toContain("aria-checked={PASTE_IMPORT_AI_ENABLED && aiSwitch}");
    expect(src).toContain("Review these trades");
    expect(src).toContain("Set ${missing} missing date");
  });
  it("dateless rows are read with no date (never today's) so the prompt shows", () => {
    const { rows } = parsePastedTrades("Bought 25 FPH.NZ at NZ$28.50. Brokerage: $5.00");
    expect(rows.length).toBe(1);
    expect(rows[0].date).toBeFalsy();
  });
});
