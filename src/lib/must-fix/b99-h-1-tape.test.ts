// b99 candidate: H-1-TAPE
/**
 * H-1-TAPE: the header tape prefix uses the hydrated rows' quotedAt.
 * React Testing Library is not in this repo (vitest environment is node), so
 * clauses 1–4 call the pure function MarketTicker renders, and clause 5
 * asserts that function is called with the rows set from GET /api/ticker.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { closeLabelFor, tapeEquityPrefix, tapeMarketsPrefix } from "@/lib/market-freshness";

/** Tue 10 Nov 2026, 7:00 pm NZDT. NZX (16:45) and ASX (16:00 Sydney) are both shut. */
const SHUT = new Date("2026-11-10T06:00:00.000Z");
/** Tue 10 Nov 2026, 2:14 pm NZDT. NZX is open; Sydney is 12:14 pm, so ASX is open too. */
const NZX_OPEN = new Date("2026-11-10T01:14:00.000Z");
/**
 * Sat 14 Nov 2026, 11:00 NZDT. 10 Nov 2026 is a Tuesday, so the next Saturday is
 * the 14th and Friday is the 13th. The brief's "Sat 15 Nov / Close 14 Nov"
 * example does not fall on those weekdays; this clock is the real Saturday.
 */
const SATURDAY = new Date("2026-11-13T22:00:00.000Z");

const TUE_CLOSE = "2026-11-10T04:00:08Z";
/** Fri 13 Nov 2026, 5:00 pm NZDT — the Friday close before that Saturday. */
const FRI_CLOSE = "2026-11-13T04:00:08Z";

type Row = { symbol: string; price: number; quotedAt: string | null };

/** Fixture shaped like GET /api/ticker. Prices are not what the prefix reads. */
function tickerPayload(quotedAt: string | null): {
  rows: { nzx: Row[]; asx: Row[]; crypto: Row[] };
} {
  return {
    rows: {
      nzx: [
        { symbol: "FPH.NZ", price: 48.54, quotedAt },
        { symbol: "AIR.NZ", price: 0.375, quotedAt },
      ],
      asx: [{ symbol: "BHP.AX", price: 59.87, quotedAt }],
      crypto: [],
    },
  };
}

const read = (path: string) => readFileSync(path, "utf8");

describe("H-1-TAPE tape prefix", () => {
  it("clause 1: a shut session with quotedAt reads Close 10 Nov 2026, same as the FPH quote route", () => {
    const feed = tickerPayload(TUE_CLOSE);
    const quoteRoute = closeLabelFor("NZX", TUE_CLOSE, SHUT);
    expect(quoteRoute).toBe("Close 10 Nov 2026");
    expect(tapeMarketsPrefix(feed.rows, SHUT)).toBe(quoteRoute);
    expect(tapeEquityPrefix(feed.rows.nzx, "NZX", SHUT)).toBe(quoteRoute);
    expect(tapeEquityPrefix(feed.rows.asx, "ASX", SHUT)).toBe("Close 10 Nov 2026");
    const shown = [
      tapeMarketsPrefix(feed.rows, SHUT),
      tapeEquityPrefix(feed.rows.nzx, "NZX", SHUT),
      tapeEquityPrefix(feed.rows.asx, "ASX", SHUT),
    ].join(" ");
    expect(shown).not.toContain("Close unavailable");
  });

  it("clause 2: Saturday with Friday quotes reads Close <Fri date> (Close 13 Nov 2026)", () => {
    const feed = tickerPayload(FRI_CLOSE);
    const friday = closeLabelFor("NZX", FRI_CLOSE, SATURDAY);
    expect(friday).toBe("Close 13 Nov 2026");
    expect(tapeMarketsPrefix(feed.rows, SATURDAY)).toBe(friday);
    expect(tapeEquityPrefix(feed.rows.nzx, "NZX", SATURDAY)).toBe("Close 13 Nov 2026");
    expect(tapeEquityPrefix(feed.rows.asx, "ASX", SATURDAY)).toBe(closeLabelFor("ASX", FRI_CLOSE, SATURDAY));
    expect(tapeMarketsPrefix(feed.rows, SATURDAY)).not.toContain("14 Nov");
    expect(tapeMarketsPrefix(feed.rows, SATURDAY)).not.toContain("15 Nov");
  });

  it("clause 3: an open NZX session keeps Delayed ~20 min and never says Live or Close", () => {
    const feed = tickerPayload(NZX_OPEN.toISOString());
    const prefix = tapeMarketsPrefix(feed.rows, NZX_OPEN);
    expect(prefix).toBe("Delayed ~20 min · NZX");
    expect(tapeEquityPrefix(feed.rows.nzx, "NZX", NZX_OPEN)).toBe("Delayed ~20 min · NZX");
    expect(tapeEquityPrefix(feed.rows.asx, "ASX", NZX_OPEN)).toBe("Delayed ~20 min · ASX");
    for (const label of [prefix, tapeEquityPrefix(feed.rows.nzx, "NZX", NZX_OPEN)]) {
      expect(label.startsWith("Delayed ~20 min")).toBe(true);
      expect(label).not.toMatch(/Live/);
      expect(label).not.toMatch(/Close/);
    }
  });

  it("clause 4: an empty payload does not throw, and a shut clock may say Close unavailable", () => {
    expect(() => tapeMarketsPrefix({ nzx: [], asx: [] }, SHUT)).not.toThrow();
    expect(() => tapeMarketsPrefix({}, SHUT)).not.toThrow();
    expect(() => tapeEquityPrefix([], "NZX", SHUT)).not.toThrow();
    expect(tapeMarketsPrefix({ nzx: [], asx: [] }, SHUT)).toBe("Close unavailable");
    expect(tapeMarketsPrefix({ nzx: [{ quotedAt: null }], asx: [{ quotedAt: null }] }, SHUT)).toBe("Close unavailable");
    expect(tapeEquityPrefix([], "ASX", SHUT)).toBe("Close unavailable");
  });

  it("clause 5: the empty server placeholder is replaced once hydrated rows arrive", () => {
    const placeholder = tapeMarketsPrefix({ nzx: [], asx: [] }, SHUT);
    const hydrated = tapeMarketsPrefix(tickerPayload(TUE_CLOSE).rows, SHUT);
    expect(placeholder).toBe("Close unavailable");
    expect(hydrated).toBe("Close 10 Nov 2026");
    expect(hydrated).not.toBe(placeholder);

    const src = read("src/components/MarketTicker.tsx");
    const seeded = src.indexOf("useState<Quote[]>(initial?.rows.nzx ?? [])");
    const fetched = src.indexOf('api.get<TickerFeed>("/api/ticker"');
    const wroteNzx = src.indexOf("setNzx(rows.nzx)");
    const wroteAsx = src.indexOf("setAsx(rows.asx)");
    const prefix = src.indexOf("tapeMarketsPrefix({ nzx, asx })");
    expect(seeded).toBeGreaterThan(0);
    expect(fetched).toBeGreaterThan(seeded);
    expect(wroteNzx).toBeGreaterThan(fetched);
    expect(wroteAsx).toBeGreaterThan(fetched);
    // Render reads the state the /api/ticker effect writes, after that effect, not the initial placeholder.
    expect(prefix).toBeGreaterThan(wroteNzx);
    expect(src.indexOf('tapeEquityPrefix(nzx, "NZX")')).toBeGreaterThan(wroteNzx);
    expect(src.indexOf('tapeEquityPrefix(asx, "ASX")')).toBeGreaterThan(wroteAsx);
    expect(src).toContain("status={marketsStatus}");
    expect(src).toContain("status={nzxStatus}");
    expect(src).toContain("status={asxStatus}");
    expect(src).not.toContain('exchangeFreshnessLabel("NZX")');
    expect(src).not.toContain('exchangeFreshnessLabel("ASX")');
    expect(src).not.toMatch(/tapeMarketsPrefix\(\{\s*nzx:\s*initial/);
    expect(src).not.toMatch(/tapeEquityPrefix\(initial/);
  });
});
