import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { formatNzd, moneyCell, roundMoney } from "@/lib/currency";
import { fdrForHolding, fifPortfolioIncome } from "@/lib/nz-tax-calc";

/**
 * b51 G-12: one rounding rule (to the cent, half-up) for page, PDF and CSV. 5-holding fixture whose
 * 5% FDR figures all land on half cents. Rounding rule pending K-06 (accountant) sign-off.
 */
const FIVE = [10_000.1, 20_000.3, 3_333.3, 12_345.7, 999.9].map((openingNzd) => ({ openingNzd, closingNzd: openingNzd }));
// 5% of each: 500.005, 1000.015, 166.665, 617.285, 49.995 → half-up: 500.01, 1000.02, 166.67, 617.29, 50.00

describe("b51 G-12: FIF rounding to the cent", () => {
  it("each holding rounds half-up; the printed total is the sum of the printed lines", () => {
    const lines = FIVE.map(fdrForHolding);
    expect(lines).toEqual([500.01, 1000.02, 166.67, 617.29, 50]);
    const total = fifPortfolioIncome(FIVE).fdrNzd;
    expect(total).toBe(2333.99);
    expect(roundMoney(lines.reduce((a, b) => a + b, 0))).toBe(total);
  });
  it("page (formatNzd), PDF and CSV cells print the same cents for half-cent and negative values", () => {
    for (const v of [1.005, 2.675, 166.665, -2.345, 0.125, 1000.015]) {
      const cell = moneyCell(v);
      expect(formatNzd(v).replace(/[^\d.-]/g, "").replace(/^-?/, v < 0 ? "-" : "")).toBe(cell.replace(/^-/, v < 0 ? "-" : ""));
    }
    expect([1.005, 2.675, -2.345].map(moneyCell)).toEqual(["1.01", "2.68", "-2.35"]);
  });
  it("no tax CSV/PDF writer rounds on its own any more", () => {
    const files = ["src/lib/tax-pack-zip.ts", "src/lib/tax-pack.ts", "src/lib/taxable-income.ts", "src/lib/tax-realised.ts", "src/lib/fif-working-paper.ts"];
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/Math\.round\(v \* 100\) \/ 100/);
      expect(s, f).toMatch(/moneyCell\(/);
    }
    expect(execSync("git grep -n 'roundMoney(value).toFixed(2)' -- src/lib ':!src/lib/currency.ts' ':!*.test.ts' || true").toString().trim()).toBe("");
  });
});
