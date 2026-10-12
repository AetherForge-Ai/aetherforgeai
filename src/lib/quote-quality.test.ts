import { describe, expect, it } from "vitest";
import { hourReturnFromChart, sliceLastHour } from "@/lib/crypto-market";
import {
  directionalSignalAllowed,
  preferOfficialSession,
  quoteIsStale,
  reconcileSessionChange,
  withholdUnconfirmedMove,
} from "@/lib/quote-quality";
import { reviewSessionMove } from "@/lib/quote-review";

describe("session percent and 1-hour window", () => {
  it("replaces a -25% print when the prior close says otherwise", () => {
    const fixed = reconcileSessionChange(1.145, -25, 1.12);
    expect(fixed.replaced).toBe(true);
    expect(fixed.changePct).toBeCloseTo(2.232, 2);
    const real = reconcileSessionChange(0.45, -32.84, 0.67);
    expect(real.replaced).toBe(false);
    expect(real.changePct).toBeCloseTo(-32.84, 2);
  });

  it("drops a bad last tick that disagrees with the official session price", () => {
    const picked = preferOfficialSession({
      barPrice: 0.84,
      officialPrice: 1.145,
      officialChangePct: 2.23,
      previousClose: 1.12,
      barChangePct: -25,
    });
    expect(picked?.price).toBe(1.145);
    expect(picked?.replaced).toBe(true);
    expect(picked?.changePct).toBeCloseTo(2.23, 1);
  });

  it("withholds an extreme percent that has no prior close", () => {
    expect(withholdUnconfirmedMove(-32, false)).toBe(true);
    expect(withholdUnconfirmedMove(-32, true)).toBe(false);
    expect(withholdUnconfirmedMove(1.2, false)).toBe(false);
  });

  it("refuses a directional scenario on a stale or unconfirmed print", () => {
    expect(
      directionalSignalAllowed({ stale: true, changeWithheld: false, verifiedHistory: true })
    ).toBe(false);
    expect(
      directionalSignalAllowed({ stale: false, changeWithheld: true, verifiedHistory: true })
    ).toBe(false);
    expect(
      directionalSignalAllowed({ stale: false, changeWithheld: false, verifiedHistory: false })
    ).toBe(false);
    expect(
      directionalSignalAllowed({ stale: false, changeWithheld: false, verifiedHistory: true })
    ).toBe(true);
    expect(quoteIsStale("2026-01-01T00:00:00.000Z", Date.parse("2026-01-10T00:00:00.000Z"), "stock")).toBe(
      true
    );
    expect(quoteIsStale("2026-01-09T00:00:00.000Z", Date.parse("2026-01-10T00:00:00.000Z"), "stock")).toBe(
      false
    );
  });

  it("withholds a reported percent that does not match the previous close", () => {
    const reviewed = reviewSessionMove({
      ticker: "RSG.AX",
      assetClass: "stock",
      price: 1.145,
      previousClose: 1.12,
      reportedChangePct: -25,
      window: "1d",
    });
    expect(reviewed.withheld).toBe(true);
    expect(reviewed.reason).toBe("disagrees with the previous close");
    const kept = reviewSessionMove({
      ticker: "RSG.AX",
      assetClass: "stock",
      price: 0.45,
      previousClose: 0.67,
      reportedChangePct: -32.84,
      window: "1d",
    });
    expect(kept.withheld).toBe(false);
  });

  it("measures one hour from timestamps and does not stretch twelve hourly bars", () => {
    const start = Date.parse("2026-10-12T12:00:00.000Z");
    const hourly = Array.from({ length: 13 }, (_, i) => ({
      t: start + i * 60 * 60 * 1000,
      price: 100 + i,
    }));
    expect(sliceLastHour(hourly)).toHaveLength(2);
    const hourMove = hourReturnFromChart(hourly);
    expect(hourMove).not.toBeNull();
    expect(Math.abs(hourMove!)).toBeLessThan(2);
    const fiveMin = Array.from({ length: 13 }, (_, i) => ({
      t: start + i * 5 * 60 * 1000,
      price: 100 - i * 0.1,
    }));
    const hour = hourReturnFromChart(fiveMin);
    expect(hour).not.toBeNull();
    expect(Math.abs(hour!)).toBeLessThan(2);
    expect(hourReturnFromChart(fiveMin, fiveMin[fiveMin.length - 1].price * 1.02)).toBeNull();
  });
});
