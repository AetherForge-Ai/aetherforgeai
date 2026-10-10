import { describe, expect, it } from "vitest";
import {
  assembleEquityProjections,
  CRYPTO_PROJECTIONS_PAUSE_MESSAGE,
  rankByConfidenceWeightedMove,
} from "./projection-pause";

describe("crypto projections pause", () => {
  it("drops crypto rows from the combined ranking and the crypto list", () => {
    const payload = assembleEquityProjections([
      { ticker: "AIR.NZ", market: "NZX", assetClass: "stock", projected7dPct: 1.2 },
      { ticker: "ARB", market: "CRYPTO", assetClass: "crypto", projected7dPct: 27.5 },
      { ticker: "BTC", market: "CRYPTO", assetClass: "crypto", projected7dPct: 4 },
      { ticker: "BHP.AX", market: "ASX", assetClass: "stock", projected7dPct: 3.1 },
    ]);

    expect(payload.cryptoPaused).toBe(true);
    expect(payload.cryptoPauseMessage).toBe(CRYPTO_PROJECTIONS_PAUSE_MESSAGE);
    expect(payload.cryptoUniverse).toEqual([]);
    expect(payload.scanned.crypto).toBe(0);
    expect(payload.combined.map((row) => row.ticker)).toEqual(["BHP.AX", "AIR.NZ"]);
    expect(payload.stockUniverse.map((row) => row.ticker)).toEqual(["AIR.NZ", "BHP.AX"]);
    expect(JSON.stringify(payload)).not.toMatch(/"market":"CRYPTO"/);
  });

  it("orders crypto rows by percent times confidence, the same rule as the other tabs", () => {
    const ordered = rankByConfidenceWeightedMove([
      { ticker: "SAND", market: "CRYPTO", projected7dPct: 27.81, confidence: 40 },
      { ticker: "AAA", market: "CRYPTO", projected7dPct: 10, confidence: 90 },
      { ticker: "LOW", market: "CRYPTO", projected7dPct: 20, confidence: 30 },
    ]);
    // 27.81 × 40 beats 10 × 90, which beats 20 × 30.
    expect(ordered.map((row) => row.ticker)).toEqual(["SAND", "AAA", "LOW"]);
  });
});
