/**
 * b60: date-only values are NZ civil dates. Noon Auckland on 1 Apr NZDT is
 * 2026-03-31T23:00Z; reading the UTC prefix put it in the previous tax year.
 * pull-check:v3-m7-b74-2026-10-27
 */
import { describe, expect, it } from "vitest";
import { dateOnlyInstant, lotCivilDay, resolveExecutedInstant } from "@/lib/executed-at";
import { nzTaxYearEnding } from "@/lib/nz-tax-year";
import { splitAdjustedRows } from "@/lib/tax-scenarios";
import { externalFlowsFromLedger } from "@/lib/performance-math";
import { fxRateLines } from "@/lib/tax-pack";

describe("b60 NZ tax-year boundary", () => {
  it("1 Apr 2026 (NZDT, before DST ends 5 Apr) stays in the year ending 2027", () => {
    const stored = String(resolveExecutedInstant("2026-04-01").stored);
    expect(new Date(stored).toISOString()).toBe("2026-03-31T23:00:00.000Z");
    expect(lotCivilDay("2026-03-31T23:00:00.000Z")).toBe("2026-04-01");
    expect(nzTaxYearEnding("2026-03-31T23:00:00.000Z")).toBe(2027);
    expect(nzTaxYearEnding(stored)).toBe(2027);
  });
  it("31 Mar 2026 (NZDT) stays in the year ending 2026", () => {
    const stored = dateOnlyInstant("2026-03-31");
    expect(new Date(stored).toISOString()).toBe("2026-03-30T23:00:00.000Z");
    expect(nzTaxYearEnding(new Date(stored).toISOString())).toBe(2026);
  });
  it("NZST boundary (hypothetical late DST): 1 Apr at noon +12 and 31 Mar at noon +12", () => {
    expect(nzTaxYearEnding("2026-04-01T00:00:00.000Z")).toBe(2027); // old UTC-midnight carrier, prefix kept
    expect(lotCivilDay("2026-04-01T12:00:00+12:00")).toBe("2026-04-01");
    expect(nzTaxYearEnding("2026-04-01T12:00:00+12:00")).toBe(2027);
    expect(nzTaxYearEnding("2026-03-31T12:00:00+12:00")).toBe(2026);
  });
  it("real NZST 1 Apr: DST ends 3am Sun 1 Apr 2029, so noon is +12", () => {
    expect(dateOnlyInstant("2029-04-01")).toBe("2029-04-01T12:00:00+12:00");
    expect(dateOnlyInstant("2029-03-31")).toBe("2029-03-31T12:00:00+13:00");
    expect(nzTaxYearEnding(new Date(dateOnlyInstant("2029-04-01")).toISOString())).toBe(2030);
    expect(nzTaxYearEnding(new Date(dateOnlyInstant("2029-03-31")).toISOString())).toBe(2029);
    expect(nzTaxYearEnding("2029-03-31T12:01:00.000Z")).toBe(2030); // 00:01 NZST 1 Apr 2029
    expect(nzTaxYearEnding("2029-03-31T10:59:00.000Z")).toBe(2029); // 23:59 NZDT 31 Mar 2029
  });
  it("NZDT midnight edges around 1 Apr 2026", () => {
    expect(nzTaxYearEnding("2026-03-31T11:00:00.000Z")).toBe(2027); // 00:00 NZDT 1 Apr
    expect(nzTaxYearEnding("2026-03-31T10:59:00.000Z")).toBe(2026); // 23:59 NZDT 31 Mar
  });
  it("old rows read safely: bare dates and UTC-midnight/noon carriers keep their day", () => {
    expect(lotCivilDay("2026-04-01")).toBe("2026-04-01");
    expect(lotCivilDay("2026-05-10T00:00:00.000Z")).toBe("2026-05-10");
    expect(lotCivilDay("2026-04-01T12:00:00Z")).toBe("2026-04-01");
  });
});

describe("b60 readers use the Auckland civil day", () => {
  it("split adjustment does not treat a 1 Sep NZST row as 31 Aug", () => {
    const rows = [{ type: "buy", ticker: "MSFT", quantity: 40, price: 400, executed_at: "2026-08-31T12:30:00.000Z" }];
    // 00:30 NZST 1 Sep: on/after a 2026-09-01 split, so unchanged.
    expect(splitAdjustedRows(rows as never, "MSFT", "2026-09-01", 2)[0]).toMatchObject({ quantity: 40 });
  });
  it("external flows date a noon-NZDT 1 Apr deposit as 1 Apr", () => {
    const flows = externalFlowsFromLedger([{ type: "deposit", executed_at: "2026-03-31T23:00:00.000Z", total: 100 } as never]);
    expect(flows[0]?.date).toBe("2026-04-01");
  });
  it("FX lines show the NZ day", () => {
    const lines = fxRateLines([{ ticker: "AAPL", type: "buy", fx_rate: 1.7, currency: "USD", executed_at: "2026-03-31T23:00:00.000Z" }]);
    expect(lines.join("\n")).toContain("2026-04-01");
  });
});
