import { describe, expect, it } from "vitest";
import { presentNzsxBoard } from "./nzsx-board";

const now = new Date("2026-10-07T07:00:00.000Z"); // 8:00 pm NZDT, after the NZX close

describe("NZSX market board", () => {
  it("shows the index, one breadth universe, movers, and a plain freshness sentence", () => {
    const board = presentNzsxBoard(
      {
        ok: true,
        data: {
          asOf: "2026-10-07T06:40:00.000Z",
          exchanges: [
            {
              exchange: "NZX",
              index: { name: "S&P/NZX 50", price: 12880.12, changePct: -0.22 },
              breadth: { advancers: 18, decliners: 27, unchanged: 3, total: 48 },
              topGainers: [{ symbol: "AIR", name: "Air New Zealand", changePct: 1.4 }],
              topLosers: [{ symbol: "FPH", name: "Fisher & Paykel Healthcare", changePct: -1.1 }],
            },
            {
              exchange: "ASX",
              index: { name: "S&P/ASX 200", price: 8000, changePct: 0.1 },
              breadth: { advancers: 1, decliners: 1, unchanged: 0, total: 2 },
              topGainers: [],
              topLosers: [],
            },
          ],
        },
      },
      now
    );

    expect(board.indexName).toBe("S&P/NZX 50");
    expect(board.level).toBe(12880.12);
    expect(board.breadth).toEqual({ advancers: 18, decliners: 27, unchanged: 3, total: 48 });
    expect(board.gainers[0]?.symbol).toBe("AIR");
    expect(board.losers[0]?.symbol).toBe("FPH");
    expect(board.universeNote).toMatch(/one universe/i);
    expect(board.freshness).toMatch(/last close/i);
    expect(board.freshness).not.toMatch(/\blive\b/i);
    expect(board.breadth?.total).not.toBe(2);
  });
});
