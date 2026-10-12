import { describe, expect, it } from "vitest";

import { resolveHoldingAction } from "@/lib/holding-action";
import { duplicateHomeFiguresVisible } from "@/lib/home-totals";

const share = { _id: "share-abc", ticker: "ABC", asset_type: "stock" };
const coin = { _id: "coin-abc", ticker: "ABC", asset_type: "crypto" };
const ledgerGold = { _id: "stock-gold", ticker: "GOLD", asset_type: "metal" };
const storeGold = { _id: "pm-gold", metal: "gold" as const };
const storeGoldAgain = { _id: "pm-gold-2", metal: "gold" as const };

describe("resolveHoldingAction", () => {
  it("matches a share and a coin that share a ticker by asset class", () => {
    const stocks = [share, coin];
    expect(resolveHoldingAction({ ticker: "abc", assetClass: "shares", stocks, metalStore: [] })).toEqual({
      ok: true,
      via: "stock",
      stockId: "share-abc",
    });
    expect(resolveHoldingAction({ ticker: "ABC", assetClass: "crypto", stocks, metalStore: [] })).toEqual({
      ok: true,
      via: "stock",
      stockId: "coin-abc",
    });
  });

  it("sends a metal-store row to the metals flow ahead of a ledger lot", () => {
    expect(
      resolveHoldingAction({
        ticker: "GOLD",
        assetClass: "metals",
        stocks: [ledgerGold],
        metalStore: [storeGold],
      })
    ).toEqual({ ok: true, via: "metal-store", metalId: "pm-gold" });
  });

  it("uses the snapshot position id and does not fall through when that id is missing", () => {
    const stocks = [
      { _id: "aaa-1", ticker: "AAA", asset_type: "stock" },
      { _id: "aaa-2", ticker: "AAA", asset_type: "" },
    ];
    expect(resolveHoldingAction({ ticker: "AAA", assetClass: "shares", holdingId: "aaa-2", stocks, metalStore: [] })).toEqual({
      ok: true,
      via: "stock",
      stockId: "aaa-2",
    });
    expect(resolveHoldingAction({ ticker: "AAA", assetClass: "shares", holdingId: "gone", stocks, metalStore: [] })).toEqual({
      ok: false,
      reason: "This row is not on the holdings list.",
    });
    expect(resolveHoldingAction({ ticker: "AAA", assetClass: "shares", stocks, metalStore: [] })).toEqual({
      ok: false,
      reason: "More than one holding uses this ticker.",
    });
  });

  it("hides actions when two metal-store rows use the same ticker", () => {
    expect(
      resolveHoldingAction({
        ticker: "GOLD",
        assetClass: "metals",
        stocks: [ledgerGold],
        metalStore: [storeGold, storeGoldAgain],
      })
    ).toEqual({ ok: false, reason: "More than one holding uses this ticker." });
    expect(
      resolveHoldingAction({
        ticker: "GOLD",
        assetClass: "metals",
        holdingId: "pm-gold-2",
        stocks: [ledgerGold],
        metalStore: [storeGold, storeGoldAgain],
      })
    ).toEqual({ ok: true, via: "metal-store", metalId: "pm-gold-2" });
  });

  it("does not treat cash as a holding row", () => {
    expect(resolveHoldingAction({ ticker: "NZD", assetClass: "cash", stocks: [], metalStore: [] })).toEqual({
      ok: false,
      reason: "Cash uses deposit and withdraw.",
    });
  });
});

describe("duplicateHomeFiguresVisible", () => {
  it("keeps the old home totals for guests, other pages, and a failed snapshot", () => {
    expect(duplicateHomeFiguresVisible({ isHome: true, preview: true, balancesReady: true, snapshotPresent: false })).toBe(true);
    expect(duplicateHomeFiguresVisible({ isHome: false, preview: false, balancesReady: true, snapshotPresent: true })).toBe(true);
    expect(duplicateHomeFiguresVisible({ isHome: true, preview: false, balancesReady: true, snapshotPresent: false })).toBe(true);
  });

  it("hides them on a signed-in home while the snapshot is loading or present", () => {
    expect(duplicateHomeFiguresVisible({ isHome: true, preview: false, balancesReady: false, snapshotPresent: false })).toBe(false);
    expect(duplicateHomeFiguresVisible({ isHome: true, preview: false, balancesReady: true, snapshotPresent: true })).toBe(false);
  });
});
