import { describe, expect, it } from "vitest";
import { assembleEquityProjections, CRYPTO_PROJECTIONS_PAUSE_MESSAGE } from "./projection-pause";

describe("crypto projections pause", () => {
  it("drops crypto rows from the combined ranking", () => {
    const payload = assembleEquityProjections([
      { ticker: "AIR.NZ", market: "NZX", assetClass: "stock", projected7dPct: 1.2 },
      { ticker: "ARB", market: "CRYPTO", assetClass: "crypto", projected7dPct: 27.5 },
      { ticker: "BHP.AX", market: "ASX", assetClass: "stock", projected7dPct: 3.1 },
    ]);
    expect(payload.cryptoPaused).toBe(true);
    expect(payload.cryptoPauseMessage).toBe(CRYPTO_PROJECTIONS_PAUSE_MESSAGE);
    expect(payload.cryptoUniverse).toEqual([]);
    expect(payload.combined.map((row) => row.ticker)).toEqual(["BHP.AX", "AIR.NZ"]);
    expect(JSON.stringify(payload)).not.toMatch(/"market":"CRYPTO"/);
  });
});
