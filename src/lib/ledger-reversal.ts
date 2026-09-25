/**
 * Plan the removal of one ledger row and the holding/cash that must follow.
 * Pure: the admin route is the only caller, and dry-run is the default.
 *
 * Cash is inverted from the row's stored NZ$ impact so unrelated deposits and
 * prior FX repairs stay put. The affected ticker is replayed from the
 * remaining filled buys and sells so quantity and average cost match the
 * ledger that is left.
 */

export interface ReversalTxn {
  _id: string;
  type?: string | null;
  ticker?: string | null;
  asset_type?: string | null;
  asset_name?: string | null;
  quantity?: number | null;
  price?: number | null;
  fees?: number | null;
  cash_nzd?: number | null;
  total?: number | null;
  executed_at?: string | null;
  createdAt?: string | null;
  execution_status?: string | null;
  currency?: string | null;
}

export interface TickerPosition {
  shares: number;
  averageCost: number;
}

export interface LedgerReversalPlan {
  transactionId: string;
  userId: string;
  ticker: string;
  assetType: string;
  assetName: string;
  side: string;
  /** Add this to the account's current NZ$ cash (inverse of the row). */
  cashDeltaNzd: number;
  signedCashNzd: number;
  holdingBefore: TickerPosition | null;
  holdingAfter: TickerPosition | null;
  /** delete when the replay is flat; create when a sell had removed the row. */
  holdingAction: "update" | "delete" | "create" | "unchanged";
}

function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function signedCashNzd(row: ReversalTxn): number {
  const cash = Number(row.cash_nzd);
  if (Number.isFinite(cash)) return cash;
  const total = Number(row.total);
  if (Number.isFinite(total)) return total;
  return 0;
}

function isFilledTrade(row: ReversalTxn): boolean {
  const status = String(row.execution_status || "filled").toLowerCase();
  if (status === "idea" || status === "paper") return false;
  const type = String(row.type || "").toLowerCase();
  return type === "buy" || type === "sell";
}

function sameInstrument(row: ReversalTxn, ticker: string, assetType: string): boolean {
  return (
    String(row.ticker || "").trim().toUpperCase() === ticker &&
    String(row.asset_type || "stock").toLowerCase() === assetType
  );
}

/** Weighted-average position from filled buys and sells, oldest first. */
export function replayTickerPosition(rows: ReversalTxn[], ticker: string, assetType: string): TickerPosition | null {
  const ordered = rows
    .filter((row) => isFilledTrade(row) && sameInstrument(row, ticker, assetType))
    .slice()
    .sort((a, b) => {
      const at = new Date(a.executed_at || a.createdAt || 0).getTime();
      const bt = new Date(b.executed_at || b.createdAt || 0).getTime();
      return at - bt;
    });

  let shares = 0;
  let avg = 0;
  for (const row of ordered) {
    const qty = Number(row.quantity) || 0;
    const price = Number(row.price) || 0;
    const fees = Math.max(0, Number(row.fees) || 0);
    if (!(qty > 0)) continue;
    if (String(row.type).toLowerCase() === "buy") {
      const next = shares + qty;
      avg = next > 0 ? (shares * avg + qty * price + fees) / next : price;
      shares = next;
    } else {
      shares = Math.max(0, shares - qty);
      if (shares <= 1e-6) {
        shares = 0;
        avg = 0;
      }
    }
  }
  if (!(shares > 1e-6)) return null;
  return { shares: round6(shares), averageCost: round6(avg) };
}

export function planLedgerReversal(
  userId: string,
  target: ReversalTxn,
  siblings: ReversalTxn[],
  holdingBefore: TickerPosition | null
): LedgerReversalPlan {
  const ticker = String(target.ticker || "").trim().toUpperCase();
  const assetType = String(target.asset_type || "stock").toLowerCase();
  const remaining = siblings.filter((row) => row._id !== target._id);
  const withTrade = ticker ? replayTickerPosition(siblings, ticker, assetType) : null;
  const withoutTrade = ticker ? replayTickerPosition(remaining, ticker, assetType) : null;
  const withShares = withTrade?.shares ?? 0;
  const withoutShares = withoutTrade?.shares ?? 0;
  // Quantity this row contributes versus the rest of the ledger (buy positive).
  const tradeDelta = withShares - withoutShares;
  const beforeShares = holdingBefore?.shares ?? 0;
  let afterShares = beforeShares - tradeDelta;
  if (afterShares <= 1e-6) afterShares = 0;
  else afterShares = round6(afterShares);

  // When the live holding is exactly the ledger (no manual lot beside it),
  // the average comes from the remaining fills. Otherwise keep the current
  // average — those extra units were not part of this row.
  const explainedByLedger = Math.abs(beforeShares - withShares) <= 1e-4;
  const holdingAfter: TickerPosition | null =
    afterShares > 1e-6
      ? {
          shares: afterShares,
          averageCost: round6(
            explainedByLedger && withoutTrade
              ? withoutTrade.averageCost
              : holdingBefore?.averageCost || withoutTrade?.averageCost || Number(target.price) || 0
          ),
        }
      : null;

  let holdingAction: LedgerReversalPlan["holdingAction"] = "unchanged";
  if (beforeShares > 1e-6 && !holdingAfter) holdingAction = "delete";
  else if (!(beforeShares > 1e-6) && holdingAfter) holdingAction = "create";
  else if (
    holdingAfter &&
    (Math.abs(beforeShares - holdingAfter.shares) > 1e-6 ||
      Math.abs((holdingBefore?.averageCost || 0) - holdingAfter.averageCost) > 1e-6)
  ) {
    holdingAction = "update";
  }

  const signed = signedCashNzd(target);
  return {
    transactionId: target._id,
    userId,
    ticker,
    assetType,
    assetName: String(target.asset_name || ticker),
    side: String(target.type || ""),
    cashDeltaNzd: round2(-signed),
    signedCashNzd: round2(signed),
    holdingBefore,
    holdingAfter,
    holdingAction,
  };
}
