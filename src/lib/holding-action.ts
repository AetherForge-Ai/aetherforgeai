import type { SnapshotClass } from "@/lib/portfolio-snapshot";

export interface HoldingActionStock {
  _id: string;
  ticker: string;
  asset_type?: string | null;
}

export interface MetalStoreRow {
  _id: string;
  metal: "gold" | "silver";
}

export type HoldingAction =
  | { ok: true; via: "stock"; stockId: string }
  | { ok: true; via: "metal-store"; metalId: string }
  | { ok: false; reason: string };

const NOT_ON_LIST = "This row is not on the holdings list.";
const MORE_THAN_ONE = "More than one holding uses this ticker.";

function sameTicker(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

/** Shares are a stock row, or a row that is neither crypto nor metal. */
export function stockAssetClass(assetType: string | null | undefined): Exclude<SnapshotClass, "cash"> {
  const type = (assetType || "").toLowerCase();
  if (type === "crypto") return "crypto";
  if (type === "metal") return "metals";
  return "shares";
}

export function metalStoreTicker(metal: "gold" | "silver"): string {
  return metal === "silver" ? "SILVER" : "GOLD";
}

/**
 * Pick the holding a table action belongs to.
 * A snapshot position id is used on its own. Without one, ticker and asset
 * class must agree, and a single metal-store row wins over a ledger metal.
 */
export function resolveHoldingAction(input: {
  ticker: string;
  assetClass: SnapshotClass;
  holdingId?: string | null;
  stocks: readonly HoldingActionStock[];
  metalStore: readonly MetalStoreRow[];
}): HoldingAction {
  if (input.assetClass === "cash") {
    return { ok: false, reason: "Cash uses deposit and withdraw." };
  }
  const ticker = input.ticker.trim().toUpperCase();
  const holdingId = input.holdingId?.trim() || "";
  if (holdingId) {
    if (input.assetClass === "metals") {
      const metal = input.metalStore.find((row) => row._id === holdingId && metalStoreTicker(row.metal) === ticker);
      if (metal) return { ok: true, via: "metal-store", metalId: metal._id };
    }
    const stock = input.stocks.find(
      (row) => row._id === holdingId && sameTicker(row.ticker, ticker) && stockAssetClass(row.asset_type) === input.assetClass
    );
    if (stock) return { ok: true, via: "stock", stockId: stock._id };
    return { ok: false, reason: NOT_ON_LIST };
  }

  if (input.assetClass === "metals") {
    const metals = input.metalStore.filter((row) => metalStoreTicker(row.metal) === ticker);
    if (metals.length === 1) return { ok: true, via: "metal-store", metalId: metals[0]._id };
    if (metals.length > 1) return { ok: false, reason: MORE_THAN_ONE };
  }

  const stocks = input.stocks.filter((row) => sameTicker(row.ticker, ticker) && stockAssetClass(row.asset_type) === input.assetClass);
  if (stocks.length === 1) return { ok: true, via: "stock", stockId: stocks[0]._id };
  if (stocks.length > 1) return { ok: false, reason: MORE_THAN_ONE };
  return { ok: false, reason: NOT_ON_LIST };
}
