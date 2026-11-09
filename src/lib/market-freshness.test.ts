import { describe, expect, it } from "vitest";
import {
  closeLabelFor,
  cryptoFreshnessLabel,
  dailyRateLabel,
  equityApiLive,
  equityFreshnessLabel,
  equitySessionDate,
  holdingPriceAsOf,
  metalUpdatedPhrase,
  metalsHomeHint,
  quotedEquitySessionOpen,
  tapeUpdatedPhrase,
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
  it("labels a shut weekday from the quote time, and keeps the API live flag false", () => {
    expect(equityFreshnessLabel("NZX", AFTER_CLOSE, AFTER_CLOSE).label).toBe("Close 7 Oct 2026");
    expect(equityFreshnessLabel("ASX", AFTER_CLOSE, AFTER_CLOSE).label).toBe("Close 7 Oct 2026");
    expect(equityFreshnessLabel("US", AFTER_CLOSE, AFTER_CLOSE).label).toBe("Close 6 Oct 2026");
    expect(equityFreshnessLabel("NZX", AFTER_CLOSE).live).toBe(false);
    expect(equityApiLive("DOW", true, AFTER_CLOSE)).toBe(false);
    expect(equityApiLive("NZX", true, AFTER_CLOSE)).toBe(false);
    expect(equityApiLive("ASX", false, NZX_OPEN)).toBe(false);
  });

  it("labels an open session as delayed and includes a vendor clock only when one exists", () => {
    const quoted = new Date("2026-10-07T01:14:00.000Z");
    expect(equityFreshnessLabel("NZX", NZX_OPEN, quoted).label).toBe("Delayed ~20 min · NZX · quote 2:14 pm NZ");
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

  it("maps Saturday and Sunday to Friday and keeps a pre-open weekday off today", () => {
    const saturday = new Date("2026-10-17T01:00:00.000Z");
    const sunday = new Date("2026-10-18T01:00:00.000Z");
    const preOpen = new Date("2026-10-13T19:00:00.000Z");
    expect(closeLabelFor("NZX", saturday, saturday)).toBe("Close 16 Oct 2026");
    expect(closeLabelFor("ASX", sunday, sunday)).toBe("Close 16 Oct 2026");
    expect(closeLabelFor("US", sunday, sunday)).toBe("Close 16 Oct 2026");
    expect(closeLabelFor("NZX", preOpen, preOpen)).toBe("Close 13 Oct 2026");
    expect(equitySessionDate("NZX", preOpen)).toBe("2026-10-13");
    expect(equitySessionDate("NZX", AFTER_CLOSE)).toBe("2026-10-07");
  });

  it("uses the exchange date when Auckland is already the next day", () => {
    const fridayEveningNewYork = new Date("2026-10-16T21:00:00.000Z");
    const quotedAt = fridayEveningNewYork.toISOString();
    expect(closeLabelFor("US", quotedAt, fridayEveningNewYork)).toBe("Close 16 Oct 2026");
    expect(equityFreshnessLabel("US", fridayEveningNewYork, fridayEveningNewYork).label).toBe("Close 16 Oct 2026");
  });

  it("leaves a missing quote timestamp undated after the weekday open", () => {
    expect(closeLabelFor("NZX", null, AFTER_CLOSE)).toBe("Close unavailable");
    expect(closeLabelFor("NZX", undefined, AFTER_CLOSE)).toBe("Close unavailable");
    expect(closeLabelFor("ASX", "", AFTER_CLOSE)).toBe("Close unavailable");
    expect(closeLabelFor("US", null, AFTER_CLOSE)).toBe("Close unavailable");
    expect(equityFreshnessLabel("NZX", AFTER_CLOSE).label).toBe("Close unavailable");
    expect(equityFreshnessLabel("ASX", AFTER_CLOSE).label).not.toMatch(/\d{4}/);
    expect(equityFreshnessLabel("US", AFTER_CLOSE).label).toBe("Close unavailable");
  });

  it("shows an older quote date and leaves the quote instant unchanged", () => {
    const saturday = new Date("2026-10-17T01:00:00.000Z");
    const quotedAt = "2026-10-14T01:00:00.000Z";
    expect(closeLabelFor("NZX", quotedAt, saturday)).toBe("Close 14 Oct 2026");
    expect(equityFreshnessLabel("NZX", saturday, new Date(quotedAt)).label).toBe("Close 14 Oct 2026");
    expect(tapeUpdatedPhrase(quotedAt, "NZX", saturday)).toBe("Close 14 Oct 2026");
    expect(holdingPriceAsOf("FPH.NZ", "shares", quotedAt, saturday)).toBe("Close 14 Oct 2026");
    expect(quotedAt).toBe("2026-10-14T01:00:00.000Z");
  });

  it("gives the quote route, tape, markets label, and holding drawer the same shut stamp", () => {
    const saturday = new Date("2026-10-17T01:00:00.000Z");
    const quotedAt = "2026-10-16T04:00:00.000Z";
    const stamp = closeLabelFor("NZX", quotedAt, saturday);
    expect(stamp).toBe("Close 16 Oct 2026");
    expect(equityFreshnessLabel("NZX", saturday, new Date(quotedAt)).label).toBe(stamp);
    expect(tapeUpdatedPhrase(quotedAt, "NZX", saturday)).toBe(stamp);
    expect(holdingPriceAsOf("FPH.NZ", "shares", quotedAt, saturday)).toBe(stamp);
    expect(holdingPriceAsOf("BTC", "crypto", quotedAt, saturday)).toBe("16 Oct 2026");
  });
});

describe("crypto and FX freshness", () => {
  it("says Live only for a crypto quote at most five minutes old", () => {
    const now = new Date("2026-10-07T06:43:00.000Z");
    const fresh = cryptoFreshnessLabel(new Date(now.getTime() - 60_000), now);
    expect(fresh.live).toBe(true);
    expect(fresh.label).toContain("Live · crypto · updated");
    expect(fresh.label).toContain(" pm NZ");
    expect(fresh.label).not.toContain("NZDT");
    expect(fresh.label).not.toContain("GMT");
    const stale = cryptoFreshnessLabel(new Date(now.getTime() - 6 * 60_000), now);
    expect(stale.live).toBe(false);
    expect(stale.label.startsWith("Delayed · updated ")).toBe(true);
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
