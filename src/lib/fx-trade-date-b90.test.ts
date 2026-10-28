/** b90 FX-1: import commits validate the broker's rate against the trade-date rate, not today's. */
import { describe, expect, it } from "vitest";
import { reviewedFxAllowed, REVIEWED_FX_REJECTED } from "@/lib/reviewed-book";
import { readFileSync } from "node:fs";

describe("b90 FX-1 trade-date FX", () => {
  // 15 Jan 2026 USD trade at the ECB trade-date rate 1.7417; a hypothetical today snapshot 1.6200 (7% away).
  it("cause: when the trade-date lookup misses its 250 ms cap, the rate is judged against today's snapshot", () => {
    expect(reviewedFxAllowed({ currency: "USD", reviewed: 1.7417, snapshot: 1.62, historical: null })).toEqual({ ok: false, message: REVIEWED_FX_REJECTED });
  });
  it("with the trade-date rate supplied, the same row passes, and a wrong rate still fails", () => {
    expect(reviewedFxAllowed({ currency: "USD", reviewed: 1.7417, snapshot: 1.62, historical: 1.7417 }).ok).toBe(true);
    expect(reviewedFxAllowed({ currency: "USD", reviewed: 1.62, snapshot: 1.62, historical: 1.7417 }).ok).toBe(false);
  });
  it("both import commit paths prefetch the trade-date rate (no 250 ms cap) and pass it to applyTransaction", () => {
    const route = readFileSync("src/app/api/import/route.ts", "utf8");
    expect(route).toMatch(/tradeDateFx\[key\] = await historicalNzdPerUnit\(t\.currency, t\.date\)/);
    expect(route).toContain("trade_date_fx:");
    const persist = readFileSync("src/lib/import/persist.ts", "utf8");
    expect(persist).toContain("trade_date_fx:");
    const tx = readFileSync("src/lib/transactions.ts", "utf8");
    expect(tx).toMatch(/knownTradeDateFx > 0 && Number\.isFinite\(knownTradeDateFx\)\s*\? Promise\.resolve\(\{ value: knownTradeDateFx/);
  });
});
