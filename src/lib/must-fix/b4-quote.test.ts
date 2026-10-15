import { beforeEach, describe, expect, it } from "vitest";
import { clearSharedPrints, readSharedPrint, roundQuotePrice, shareQuotePrint, SHARED_QUOTE_TTL_MS } from "@/lib/quote-store";
import { equityFreshnessLabel } from "@/lib/market-freshness";

describe("H-1 one shared quote", () => {
  beforeEach(clearSharedPrints);
  it("the second view gets the first view's print (FPH.NZ 48.635 vs 48.63)", () => {
    const tape = shareQuotePrint("FPH.NZ", { price: 48.635, changePct: 0.4 }, 1000);
    const drawer = shareQuotePrint("FPH.NZ", { price: 48.63, changePct: 0.39 }, 2000);
    expect(drawer).toEqual(tape);
    expect(drawer.price).toBe(48.64);
  });
  it("expires after the TTL", () => {
    shareQuotePrint("AIR.NZ", { price: 0.385, changePct: 0 }, 0);
    expect(readSharedPrint("air.nz", SHARED_QUOTE_TTL_MS)).not.toBeNull();
    expect(readSharedPrint("AIR.NZ", SHARED_QUOTE_TTL_MS + 1)).toBeNull();
  });
  it("keeps small prices", () => {
    expect(roundQuotePrice(0.385)).toBe(0.385);
    expect(roundQuotePrice(0.0000123456789)).toBe(0.0000123457);
    expect(roundQuotePrice(1234.567)).toBe(1234.57);
  });
});

describe("H-1 freshness snapshots", () => {
  // 11:30 am NZDT Wed 14 Oct 2026 = 22:30Z Tue 13 Oct.
  const weekday = new Date("2026-10-13T22:30:00Z");
  // 11:30 am NZDT Sat 17 Oct 2026.
  const saturday = new Date("2026-10-16T22:30:00Z");
  it("weekday open: delayed, never Live", () => {
    const { label } = equityFreshnessLabel("NZX", weekday);
    expect(label).toMatch(/^Delayed/);
    expect(label).toMatchSnapshot();
  });
  it("Saturday: Close with Friday's date", () => {
    const { label } = equityFreshnessLabel("NZX", saturday);
    expect(label).toMatch(/^Close · NZX · .*16 Oct/);
    expect(label).toMatchSnapshot();
  });
  it("weekday before open and US weekend", () => {
    expect(equityFreshnessLabel("NZX", new Date("2026-10-13T19:00:00Z")).label).toMatchSnapshot();
    expect(equityFreshnessLabel("US", saturday).label).toMatchSnapshot();
  });
});
