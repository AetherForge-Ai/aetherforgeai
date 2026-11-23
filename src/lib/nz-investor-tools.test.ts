import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import sitemap from "@/app/sitemap";
import DividendPage, { metadata as dividendMetadata } from "@/app/tools/dividend-imputation/page";
import FifPage, { metadata as fifMetadata } from "@/app/tools/fif-threshold/page";
import ToolsPage, { metadata as toolsMetadata } from "@/app/tools/page";
import { DividendImputationTool } from "@/components/tools/DividendImputationTool";
import { FifThresholdTool } from "@/components/tools/FifThresholdTool";
import { documentAccess } from "@/lib/route-gate";
import {
  ASX_EXEMPTION_CONDITIONS,
  DIVIDEND_IRD_SOURCES,
  FIF_DE_MINIMIS_CENTS,
  FIF_IRD_SOURCES,
  TOOLS_DISCLAIMER,
  describeFifCost,
  describeImputation,
  type FullyImputedDividend,
  fifCostPosition,
  formatCentsNzd,
  illustrateFullyImputedDividend,
  maximumImputationCreditCents,
  parseNzdInput,
} from "@/lib/nz-investor-tools";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tools",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));

const DISCLAIMER = "General information, not tax or financial advice. Check with IRD or your accountant.";

function read(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function html(node: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(node);
}

describe("FIF de minimis boundaries", () => {
  it("classifies 49,999 / 50,000 / 50,001", () => {
    expect(FIF_DE_MINIMIS_CENTS).toBe(5_000_000);
    expect(parseNzdInput("49999")).toEqual({ ok: true, cents: 4_999_900 });
    expect(parseNzdInput("50,000")).toEqual({ ok: true, cents: 5_000_000 });
    expect(parseNzdInput("50,001")).toEqual({ ok: true, cents: 5_000_100 });
    expect(parseNzdInput("NZ$50,000.00")).toEqual({ ok: true, cents: 5_000_000 });
    expect(fifCostPosition(4_999_900)).toBe("under");
    expect(fifCostPosition(5_000_000)).toBe("at");
    expect(fifCostPosition(5_000_100)).toBe("over");
    expect(fifCostPosition(4_999_999)).toBe("under");
    expect(fifCostPosition(5_000_001)).toBe("over");
    expect(describeFifCost(4_999_900)?.heading).toContain("likely under");
    expect(describeFifCost(5_000_000)?.heading).toContain("not over");
    expect(describeFifCost(5_000_000)?.body).toContain("does not exceed");
    expect(describeFifCost(5_000_100)?.heading).toContain("likely over");
    expect(describeFifCost(5_000_100)?.body).toContain("first NZ$50,000 is not exempt");
  });

  it("rejects amounts that are not a dollar figure", () => {
    expect(parseNzdInput("")).toEqual({ ok: false, reason: "empty" });
    expect(parseNzdInput("  ")).toEqual({ ok: false, reason: "empty" });
    expect(parseNzdInput("-1").ok).toBe(false);
    expect(parseNzdInput("50.001").ok).toBe(false);
    expect(parseNzdInput("abc").ok).toBe(false);
    expect(fifCostPosition(-1)).toBeNull();
    expect(describeFifCost(1.5)).toBeNull();
  });
});

describe("fully imputed dividend", () => {
  it("matches IR274: $720 cash, $280 credit, $1,000 gross, $50 top-up at 33%", () => {
    const row = illustrateFullyImputedDividend(72_000, "33");
    expect(row).toMatchObject({
      cashCents: 72_000,
      imputationCents: 28_000,
      grossCents: 100_000,
      taxCents: 33_000,
      differenceCents: 5_000,
      outcome: "top-up",
    });
    expect(describeImputation(row!).heading).toBe("Top-up of NZ$50.00");
    expect(describeImputation(row!).body).toContain("extra tax");
  });

  it("illustrates the other published individual rates on that same $1,000 gross dividend", () => {
    expect(illustrateFullyImputedDividend(72_000, "10.5")).toMatchObject({
      taxCents: 10_500,
      differenceCents: -17_500,
      outcome: "unused-credit",
    });
    expect(illustrateFullyImputedDividend(72_000, "17.5")).toMatchObject({
      taxCents: 17_500,
      differenceCents: -10_500,
      outcome: "unused-credit",
    });
    expect(illustrateFullyImputedDividend(72_000, "30")).toMatchObject({
      taxCents: 30_000,
      differenceCents: 2_000,
      outcome: "top-up",
    });
    const top = illustrateFullyImputedDividend(72_000, "39");
    expect(top).toMatchObject({ taxCents: 39_000, differenceCents: 11_000, outcome: "top-up" });
    expect(describeImputation(top!).heading).toBe("Top-up of NZ$110.00");
    const low = illustrateFullyImputedDividend(72_000, "10.5")!;
    expect(describeImputation(low).body).toContain("not refundable");
    expect(describeImputation(low).body).toContain("carried forward");
  });

  it("uses 28/72 and rounds to the nearest cent, including 38.89 cents per $1 on $100", () => {
    expect(maximumImputationCreditCents(10_000)).toBe(3_889);
    expect(maximumImputationCreditCents(100)).toBe(39);
    expect(maximumImputationCreditCents(0)).toBe(0);
    expect(illustrateFullyImputedDividend(0, "33")?.outcome).toBe("matched");
    for (let cash = 0; cash <= 10_000; cash += 1) {
      const credit = maximumImputationCreditCents(cash)!;
      const drift = Math.abs(credit * 72 - cash * 28);
      expect(drift).toBeLessThanOrEqual(36);
    }
    expect(illustrateFullyImputedDividend(72_000, "28")).toBeNull();
    expect(illustrateFullyImputedDividend(-1, "33")).toBeNull();
    const matched: FullyImputedDividend = {
      cashCents: 100,
      imputationCents: 50,
      grossCents: 150,
      rateId: "33",
      rateLabel: "33%",
      taxCents: 50,
      differenceCents: 0,
      outcome: "matched",
    };
    expect(describeImputation(matched).heading).toBe("No top-up on this dividend");
    expect(describeImputation(matched).body).toContain("equals the imputation credit");
  });
});

describe("public calculator pages", () => {
  it("renders the disclaimer, labelled inputs, and cited IRD urls", () => {
    expect(TOOLS_DISCLAIMER).toBe(DISCLAIMER);
    const pages = [html(createElement(ToolsPage)), html(createElement(FifPage)), html(createElement(DividendPage))];
    for (const page of pages) {
      expect(page).toContain(DISCLAIMER);
      expect(page).toContain("Track your portfolio");
      expect(page).toContain('href="/dashboard"');
    }
    const fif = html(createElement(FifPage));
    const dividend = html(createElement(DividendPage));
    expect(fif).toContain('for="fif-cost"');
    expect(fif).toContain('id="fif-cost"');
    expect(fif).toContain("min-h-11 w-full");
    expect(fif).toContain("text-base");
    for (const source of FIF_IRD_SOURCES) expect(fif).toContain(source.url);
    for (const condition of ASX_EXEMPTION_CONDITIONS) expect(fif).toContain(condition);
    expect(dividend).toContain('for="dividend-cash"');
    expect(dividend).toContain('id="dividend-cash"');
    expect(dividend).toContain('for="dividend-rate"');
    expect(dividend).toContain('id="dividend-rate"');
    expect(dividend).toContain("min-h-11 w-full");
    for (const source of DIVIDEND_IRD_SOURCES) expect(dividend).toContain(source.url);
    expect(dividend).toContain("not refundable");
    for (const meta of [toolsMetadata, fifMetadata, dividendMetadata]) {
      expect(typeof meta.title).toBe("string");
      expect(String(meta.title).length).toBeGreaterThan(10);
      expect(meta.description?.length).toBeGreaterThan(20);
      expect(meta.robots).toBeUndefined();
    }
    expect(String(fifMetadata.title)).toContain("FIF");
    expect(fifMetadata.description).toContain("NZ$50,000");
  });

  it("explains the three FIF boundaries and the imputation examples in the rendered form", () => {
    expect(html(createElement(FifThresholdTool, { initialCost: "49999" }))).toContain("likely under");
    expect(html(createElement(FifThresholdTool, { initialCost: "50000" }))).toContain("not over");
    expect(html(createElement(FifThresholdTool, { initialCost: "50001" }))).toContain("likely over");
    const imputed = html(createElement(DividendImputationTool, { initialCash: "720", initialRate: "33" }));
    expect(imputed).toContain("NZ$280.00");
    expect(imputed).toContain("NZ$1,000.00");
    expect(imputed).toContain("Top-up of NZ$50.00");
    const refundShape = html(createElement(DividendImputationTool, { initialCash: "720", initialRate: "10.5" }));
    expect(refundShape).toContain("Unused credit of NZ$175.00");
    expect(refundShape).toContain("not refundable");
  });

  it("is public, indexable, and does not store input or read a session", () => {
    for (const route of ["/tools", "/tools/fif-threshold", "/tools/dividend-imputation"]) {
      expect(documentAccess(route)).toBe("public");
    }
    const paths = sitemap().map((row) => new URL(row.url).pathname);
    expect(paths).toEqual(expect.arrayContaining(["/tools", "/tools/fif-threshold", "/tools/dividend-imputation"]));
    const files = [
      "src/app/tools/page.tsx",
      "src/app/tools/fif-threshold/page.tsx",
      "src/app/tools/dividend-imputation/page.tsx",
      "src/components/tools/FifThresholdTool.tsx",
      "src/components/tools/DividendImputationTool.tsx",
      "src/lib/nz-investor-tools.ts",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toMatch(/localStorage|sessionStorage|getCurrentUser|totalumSdk|process\.env/);
      expect(source).not.toMatch(/index:\s*false/);
      expect(source).not.toMatch(/\bfetch\s*\(/);
    }
    const calc = read("src/lib/nz-investor-tools.ts");
    for (const source of [...FIF_IRD_SOURCES, ...DIVIDEND_IRD_SOURCES]) {
      expect(source.url.startsWith("https://www.ird.govt.nz/")).toBe(true);
      expect(calc).toContain(source.url);
    }
    expect(formatCentsNzd(5_000_000)).toBe("NZ$50,000.00");
  });
});
