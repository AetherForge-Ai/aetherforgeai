import { describe, expect, it } from "vitest";
import { formatMarketPrice } from "@/lib/market-intel";
import {
  adaptiveFractionDigits,
  audToNzd,
  convertCurrency,
  ensureNzdPerAud,
  ensureNzdPerUsd,
  formatMoney,
  formatUsdWithRate,
  nativeToNzd,
  usdToNzd,
} from "@/lib/currency";

describe("usdToNzd", () => {
  const nzdPerUsd = 1.67;

  it("multiplies a known US$ notional by NZD per USD", () => {
    // 116.99 × 1.67 ≈ 195.37 — the direction a ~US$117 fill must take.
    expect(usdToNzd(116.99, nzdPerUsd)).toBeCloseTo(195.373, 2);
    expect(usdToNzd(100, nzdPerUsd)).toBe(167);
  });

  it("refuses to multiply by the NZD→USD quote", () => {
    // 0.71 is USD per NZD (or 1/1.41). Using it as a multiplier is the inversion.
    expect(ensureNzdPerUsd(0.71)).toBeCloseTo(1 / 0.71, 8);
    expect(usdToNzd(116.99, 0.71)).toBeCloseTo(116.99 / 0.71, 6);
    expect(usdToNzd(116.99, 0.71)).toBeGreaterThan(160);
    expect(usdToNzd(116.99, 0.71)).not.toBeCloseTo(116.99 * 0.71, 0);
  });

  it("books the 0.4 SOL fill from quantity × unit price, not the unit price alone", () => {
    // SOL spot ~US$116.52. 0.4 coins + a US$0.47 fee is US$47.08, not US$117.
    const usd = 0.4 * 116.52 + 0.47;
    const live = 1 / 0.567859; // today's er-api USD-per-NZD, inverted
    expect(usd).toBeCloseTo(47.078, 3);
    expect(nativeToNzd(usd, "USD", { NZD: 1, AUD: 1.09, USD: 0.567859 })).toBeCloseTo(82.9, 1);
    expect(usdToNzd(usd, live)).toBeCloseTo(82.9, 1);
    // The full US$116.99 notional at the same rate is ~NZ$206, not NZ$83.
    expect(usdToNzd(116.52 + 0.47, live)).toBeGreaterThan(190);
  });

  it("leaves a sub-1 AUD rate alone because NZD/AUD can trade through parity", () => {
    expect(ensureNzdPerAud(0.95)).toBe(0.95);
    expect(audToNzd(100, 0.95)).toBe(95);
    expect(nativeToNzd(100, "AUD", { NZD: 1, AUD: 0.95, USD: 1.67 })).toBe(95);
  });

  it("converts sell proceeds and fees with the same rate", () => {
    const proceedsUsd = 0.4 * 120 - 3;
    const rates = { NZD: 1, AUD: 0.92, USD: 0.6 };
    expect(nativeToNzd(proceedsUsd, "USD", rates)).toBeCloseTo(proceedsUsd / 0.6, 6);
    expect(convertCurrency(3, "USD", "NZD", rates)).toBeCloseTo(5, 6);
    expect(convertCurrency(10, "NZD", "USD", rates)).toBeCloseTo(6, 6);
  });
});

describe("public USD caption", () => {
  it("converts with the same four-decimal rate it prints", () => {
    const rates = { NZD: 1, AUD: 1.238083446824316, USD: 1.7814673946930086 };
    const line = formatUsdWithRate(300, rates, "2026-10-04T04:06:51.545Z");
    expect(line).toContain("1 NZD = US$0.5613");
    expect(line).toContain("US$168.39");
    expect(line).toContain("4 Oct 2026");
    expect(formatUsdWithRate(16, rates, "2026-10-04T04:06:51.545Z")).toContain("US$8.98");
    expect(formatUsdWithRate(49, rates, "2026-10-04T04:06:51.545Z")).toContain("US$27.50");
    expect(formatUsdWithRate(199, rates, "2026-10-04T04:06:51.545Z")).toContain("US$111.70");
  });

  it("does not print a sub-cent coin as zero", () => {
    const line = formatMarketPrice(0.00000812, "USD");
    expect(line).toContain("0.00000812");
    expect(line).not.toMatch(/0\.00$/);
  });
});

describe("adaptive price formatter", () => {
  it("keeps 4–6 significant figures under $1 so sub-cent prices are not $0.00", () => {
    expect(adaptiveFractionDigits(0.1842)).toBeGreaterThanOrEqual(4);
    expect(adaptiveFractionDigits(0.004218)).toBeGreaterThanOrEqual(6);
    const arb = formatMoney(0.1842, "USD");
    const hard = formatMoney(0.004218, "USD");
    expect(arb).not.toMatch(/0\.00$/);
    expect(hard).not.toMatch(/0\.00$/);
    expect(arb).toContain("0.1842");
    expect(hard).toContain("0.004218");
    expect(formatMoney(116.52, "USD")).toBe("US$116.52");
    expect(formatMoney(-116.52, "NZD")).toBe("-NZ$116.52");
    expect(formatMoney(-10, "USD")).toBe("-US$10.00");
  });
});
