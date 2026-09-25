import { describe, expect, it } from "vitest";
import { alertListedOnDesk, alertsForDesk, inferAlertAssetType } from "@/lib/alert-desk";

const bhp = { ticker: "BHP.AX", status: "active", assetType: "stock", stockId: "h-bhp" };
const tsla = { ticker: "TSLA", status: "active", assetType: "stock", stockId: "" };
const sol = { ticker: "SOL", status: "active", assetType: "crypto", stockId: "h-sol" };
const gold = { ticker: "GOLD", status: "active", assetType: "metal", stockId: "" };
const sold = { ticker: "CLW", status: "active", assetType: "stock", stockId: "h-clw" };
const archived = { ticker: "CLW", status: "archived", assetType: "stock", stockId: "" };

const book = [
  { _id: "h-bhp", ticker: "BHP.AX", shares: 40, asset_type: "stock" },
  { _id: "h-sol", ticker: "SOL", shares: 2, asset_type: "crypto" },
  { _id: "h-gold", ticker: "GOLD", shares: 0.065, asset_type: "metal" },
  { _id: "h-flat", ticker: "WOW.AX", shares: 0, asset_type: "stock" },
];

describe("alert desk list", () => {
  it("lists a created stock alert on the stock desk after create, including names not held yet", () => {
    expect(alertListedOnDesk(tsla, "stock", book)).toBe(true);
    expect(alertListedOnDesk(bhp, "stock", book)).toBe(true);
    expect(alertsForDesk([bhp, tsla, sol, gold], "stock", book).map((a) => a.ticker)).toEqual(["BHP.AX", "TSLA"]);
  });

  it("keeps crypto and metals on their own desks", () => {
    expect(alertsForDesk([bhp, sol, gold], "crypto", book).map((a) => a.ticker)).toEqual(["SOL"]);
    expect(alertsForDesk([bhp, sol, gold], "metal", book).map((a) => a.ticker)).toEqual(["GOLD"]);
    expect(alertListedOnDesk(gold, "stock", book)).toBe(false);
  });

  it("hides Watching when the holding row is flat or the linked position was sold off", () => {
    expect(alertListedOnDesk({ ticker: "WOW.AX", status: "active", assetType: "stock", stockId: "h-flat" }, "stock", book)).toBe(false);
    expect(alertListedOnDesk(sold, "stock", book)).toBe(false);
    expect(alertListedOnDesk(archived, "stock", book)).toBe(false);
  });

  it("does not blank the desk when the holdings book has not loaded", () => {
    expect(alertListedOnDesk(bhp, "stock", null)).toBe(true);
    expect(alertListedOnDesk(sol, "crypto", null)).toBe(true);
    expect(alertListedOnDesk(gold, "metal", null)).toBe(true);
    expect(alertsForDesk([bhp, sol, gold, archived], "stock", null).map((a) => a.ticker)).toEqual(["BHP.AX"]);
  });

  it("treats BHP and BHP.AX as the same held name, and maps metals keys", () => {
    expect(
      alertListedOnDesk({ ticker: "BHP", status: "active", assetType: "stock", stockId: "" }, "stock", book)
    ).toBe(true);
    expect(inferAlertAssetType("GOLD", "metals", null)).toBe("metal");
    expect(inferAlertAssetType("SOL", undefined, "crypto")).toBe("crypto");
    expect(inferAlertAssetType("AAPL", undefined, undefined)).toBe("stock");
  });
});
