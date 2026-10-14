import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { stoxReviewCopy } from "@/lib/report-copy";

const page = readFileSync("src/app/how-to-maximize-results/page.tsx", "utf8");

describe("TT fresh audit U1/U2/H10 — /how-to-maximize-results", () => {
  it("U1: has no blanket no-liability line and points to Terms §9/§11 + CGA", () => {
    expect(page).not.toMatch(/accepts no liability for any losses/);
    expect(page).toMatch(/sections 9 and 11/);
    expect(page).toMatch(/Consumer Guarantees Act 1993/);
  });
  it("U2: no profit-implying phrases", () => {
    for (const p of [/makes it profitable/, /institution/i, /Maximum Results Framework/, /Discipline turns clarity/, /edge/]) {
      expect(page).not.toMatch(p);
    }
  });
  it("H10: no non-existent feature names and no daily dual-bot routine", () => {
    for (const p of [/Smart Price Alerts/, /Strategy Builder/, /Total Portfolio Intelligence/, /Scenario Simulations/, /Excel Transaction Tracker/, /Morning Stox \+ Koins/, /at least once a day/]) {
      expect(page).not.toMatch(p);
    }
  });
});

describe("TT fresh audit U3 — public Stox example", () => {
  it("uses EXAMPLE tickers and no trade-signal label", () => {
    const c = stoxReviewCopy();
    expect(c).toContain("EXAMPLE.NZ");
    expect(c).not.toMatch(/MAH|\b(BUY|SELL|TRIM|HOLD|ACCUMULATE)\b/);
  });
});

import { plausibleVolume24h } from "@/lib/crypto-market";
describe("TT fresh audit U4 — implausible 24h volume", () => {
  it("drops BTC US$981.73B volume against a US$1.68T cap", () => {
    expect(plausibleVolume24h(981.73e9, 1.68e12)).toBeNull();
  });
  it("keeps a real BTC volume", () => {
    expect(plausibleVolume24h(27.3e9, 1.68e12)).toBe(27.3e9);
  });
  it("drops volume above 5x cap for small coins, keeps unknown-cap volume", () => {
    expect(plausibleVolume24h(6e6, 1e6)).toBeNull();
    expect(plausibleVolume24h(5e6, null)).toBe(5e6);
  });
});
