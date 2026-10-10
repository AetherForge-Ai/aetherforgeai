import { describe, expect, it } from "vitest";
import {
  cryptoFreshnessLabel,
  dailyRateLabel,
  equityApiLive,
  equityFreshnessLabel,
  equitySessionDate,
  metalUpdatedPhrase,
  metalsHomeHint,
  quotedEquitySessionOpen,
} from "@/lib/market-freshness";

/** Wednesday 7 Oct 2026, 9:00 pm NZDT. US cash session has not opened. */
const AFTER_CLOSE = new Date("2026-10-07T08:00:00.000Z");
/** Wednesday 7 Oct 2026, 2:14 pm NZDT. NZX is open. */
const NZX_OPEN = new Date("2026-10-07T01:14:00.000Z");
/** Wednesday 7 Oct 2026, 10:30 am Sydney. ASX is open. */
const ASX_OPEN = new Date("2026-10-06T23:30:00.000Z");
/** Wednesday 7 Oct 2026, 10:00 am New York. US cash session is open. */
const US_OPEN = new Date("2026-10-07T14:00:00.000Z");

describe("equity freshness", () => {
  it("labels a shut weekday as close or last close, and keeps the API live flag false", () => {
    expect(equityFreshnessLabel("NZX", AFTER_CLOSE).label).toBe("Close · NZX · 7 Oct 2026");
    expect(equityFreshnessLabel("ASX", AFTER_CLOSE).label).toBe("Close · ASX · 7 Oct 2026");
    expect(equityFreshnessLabel("US", AFTER_CLOSE).label).toBe("Last close · 6 Oct 2026 (New York)");
    expect(equityFreshnessLabel("NZX", AFTER_CLOSE).live).toBe(false);
    expect(equityApiLive("DOW", true, AFTER_CLOSE)).toBe(false);
    expect(equityApiLive("NZX", true, AFTER_CLOSE)).toBe(false);
    expect(equityApiLive("ASX", false, NZX_OPEN)).toBe(false);
  });

  it("labels an open session as delayed and includes a vendor clock only when one exists", () => {
    const quoted = new Date("2026-10-07T01:14:00.000Z");
    expect(equityFreshnessLabel("NZX", NZX_OPEN, quoted).label).toBe("Delayed ~20 min · NZX · quote 2:14 pm NZDT");
    expect(equityFreshnessLabel("NZX", NZX_OPEN).label).toBe("Delayed ~20 min · NZX");
    expect(equityFreshnessLabel("ASX", ASX_OPEN).label).toBe("Delayed ~20 min · ASX");
    expect(equityFreshnessLabel("ASX", ASX_OPEN, ASX_OPEN).label).toMatch(/^Delayed ~20 min · ASX · quote /);
    expect(equityFreshnessLabel("US", US_OPEN).label).toBe("Delayed · US");
    expect(equityFreshnessLabel("US", US_OPEN, US_OPEN).label).toBe("Delayed · US · quote 10:00 am New York");
    expect(equityFreshnessLabel("US", US_OPEN, US_OPEN).label).not.toContain("GMT");
    expect(equityFreshnessLabel("US", US_OPEN, US_OPEN).label).not.toContain("~20");
    expect(equityFreshnessLabel("NZX", NZX_OPEN).live).toBe(false);
    expect(equityApiLive("NZX", true, NZX_OPEN)).toBe(true);
    expect(quotedEquitySessionOpen(["NZX", "ASX", "US"], AFTER_CLOSE)).toBe(false);
    expect(quotedEquitySessionOpen(["NZX", "ASX"], NZX_OPEN)).toBe(true);
    expect(quotedEquitySessionOpen(["US"], US_OPEN)).toBe(true);
    expect(quotedEquitySessionOpen([], US_OPEN)).toBe(false);
  });

  it("uses the previous weekday before the open", () => {
    expect(equitySessionDate("US", AFTER_CLOSE)).toBe("2026-10-06");
    expect(equitySessionDate("NZX", AFTER_CLOSE)).toBe("2026-10-07");
  });
});

describe("crypto and FX freshness", () => {
  it("says Live only for a crypto quote at most five minutes old", () => {
    const now = new Date("2026-10-07T06:43:00.000Z");
    const fresh = cryptoFreshnessLabel(new Date(now.getTime() - 60_000), now);
    expect(fresh.live).toBe(true);
    expect(fresh.label).toContain("Live · crypto · updated");
    expect(fresh.label).toContain("NZDT");
    const stale = cryptoFreshnessLabel(new Date(now.getTime() - 6 * 60_000), now);
    expect(stale.live).toBe(false);
    expect(stale.label.startsWith("Updated ")).toBe(true);
    expect(stale.label).not.toContain("Live");
    expect(cryptoFreshnessLabel(null, now)).toEqual({ label: "Last updated: unavailable", live: false });
  });

  it("labels FX as a daily rate and never live", () => {
    expect(dailyRateLabel("2026-10-07T06:40:00.000Z")).toBe("Daily rate · 7 Oct 2026");
    expect(dailyRateLabel(null)).toBe("Daily rate");
  });

  it("labels home metals Est. until the quote is live, then the same clock as the tape", () => {
    expect(metalsHomeHint(false, "2026-10-07T13:20:00.000Z")).toBe("Est. gold and silver. Not a report.");
    const phrase = metalUpdatedPhrase("2026-10-07T13:20:00.000Z");
    expect(phrase).toMatch(/^Spot · updated /);
    expect(phrase).not.toContain("Live");
    expect(metalsHomeHint(true, "2026-10-07T13:20:00.000Z")).toBe(`${phrase} gold and silver. Not a report.`);
    expect(metalsHomeHint(true, null)).toBe("Spot gold and silver. Not a report.");
  });
});
