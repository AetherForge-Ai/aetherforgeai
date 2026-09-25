/**
 * Remove one ledger row and recompute that account's cash, the affected
 * holding, and net worth. Dry-run unless apply is explicit. Never called
 * from a page.
 */

import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { currencyForTicker, nativeToNzd, type FxRatesToNZD, BASELINE_FX_TO_NZD } from "@/lib/currency";
import { getFxSnapshot } from "@/lib/fx";
import {
  planLedgerReversal,
  type ReversalTxn,
  type TickerPosition,
} from "@/lib/ledger-reversal";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface StockRow {
  _id: string;
  ticker?: string;
  asset_type?: string;
  shares?: number;
  purchase_price?: number;
  current_price?: number;
  company_name?: string;
  user?: string;
}

interface MetalRow {
  _id: string;
  metal?: string;
  ounces?: number;
  purchase_price_per_oz?: number;
}

function metalKey(ticker: string): "gold" | "silver" | null {
  if (ticker === "GOLD") return "gold";
  if (ticker === "SILVER") return "silver";
  return null;
}

function netWorth(cash: number, stocks: StockRow[], metals: MetalRow[], rates: FxRatesToNZD, spot: { gold: number; silver: number }): number {
  let total = cash;
  for (const row of stocks) {
    const ticker = String(row.ticker || "");
    const asset = (row.asset_type || "stock") as "stock" | "crypto" | "metal";
    const currency = currencyForTicker(ticker, asset);
    const qty = Number(row.shares) || 0;
    const px = Number(row.current_price) || Number(row.purchase_price) || 0;
    total += nativeToNzd(qty * px, currency, rates);
  }
  for (const row of metals) {
    const key = row.metal === "silver" ? "silver" : "gold";
    total += (Number(row.ounces) || 0) * (spot[key] || 0);
  }
  return round2(total);
}

export async function planOrApplyLedgerReversal(transactionId: string, apply: boolean) {
  const loaded = await totalumSdk.crud.getRecordById("transaction", transactionId);
  const target = (loaded as { data?: ReversalTxn & { user?: string } })?.data;
  if (!target?._id) throw new Error("Ledger entry not found");
  const userId = String(target.user || "");
  if (!userId) throw new Error("Ledger entry has no account");

  const [txRes, stockRes, metalRes, userRes] = await Promise.all([
    totalumSdk.crud.query("transaction", { _filter: { user: userId }, _limit: 5000 }),
    totalumSdk.crud.query("stock", { _filter: { user: userId }, _limit: 500 }),
    totalumSdk.crud.query("precious_metal", { _filter: { user: userId }, _limit: 50 }).catch(() => ({ data: [] })),
    totalumSdk.crud.getRecordById("user", userId),
  ]);
  const transactions = ((txRes?.data as unknown as ReversalTxn[]) || []).filter((row) => row?._id);
  if (!transactions.some((row) => row._id === target._id)) transactions.push(target);

  const ticker = String(target.ticker || "").trim().toUpperCase();
  const assetType = String(target.asset_type || "stock").toLowerCase();
  const stocks = ((stockRes?.data as StockRow[]) || []).filter((row) => row?._id);
  const metals = ((metalRes?.data as MetalRow[]) || []).filter((row) => row?._id);
  const stock = stocks.find(
    (row) => String(row.ticker || "").toUpperCase() === ticker && String(row.asset_type || "stock").toLowerCase() === assetType
  );
  const key = metalKey(ticker);
  const precious = key ? metals.find((row) => row.metal === key) : undefined;
  const before: TickerPosition | null = stock
    ? { shares: Number(stock.shares) || 0, averageCost: Number(stock.purchase_price) || 0 }
    : precious
      ? { shares: Number(precious.ounces) || 0, averageCost: Number(precious.purchase_price_per_oz) || 0 }
      : null;

  const plan = planLedgerReversal(userId, target, transactions, before);
  const cashBefore = Number((userRes as { data?: { cash_balance?: number } })?.data?.cash_balance) || 0;
  const cashAfter = round2(cashBefore + plan.cashDeltaNzd);

  let rates = BASELINE_FX_TO_NZD;
  try {
    rates = (await getFxSnapshot()).ratesToNZD;
  } catch {
    rates = BASELINE_FX_TO_NZD;
  }
  const spot = { gold: 0, silver: 0 };
  for (const row of stocks) {
    if (String(row.ticker).toUpperCase() === "GOLD") spot.gold = Number(row.current_price) || spot.gold;
    if (String(row.ticker).toUpperCase() === "SILVER") spot.silver = Number(row.current_price) || spot.silver;
  }

  const stocksAfter = stocks.map((row) => ({ ...row }));
  const metalsAfter = metals.map((row) => ({ ...row }));
  if (stock && plan.holdingAction === "delete") {
    const idx = stocksAfter.findIndex((row) => row._id === stock._id);
    if (idx >= 0) stocksAfter.splice(idx, 1);
  } else if (stock && plan.holdingAfter && (plan.holdingAction === "update" || plan.holdingAction === "unchanged")) {
    const idx = stocksAfter.findIndex((row) => row._id === stock._id);
    if (idx >= 0 && plan.holdingAction === "update") {
      stocksAfter[idx] = {
        ...stocksAfter[idx],
        shares: plan.holdingAfter.shares,
        purchase_price: plan.holdingAfter.averageCost,
      };
    }
  } else if (!stock && precious && plan.holdingAction === "delete") {
    const idx = metalsAfter.findIndex((row) => row._id === precious._id);
    if (idx >= 0) metalsAfter.splice(idx, 1);
  } else if (!stock && precious && plan.holdingAfter && plan.holdingAction === "update") {
    const idx = metalsAfter.findIndex((row) => row._id === precious._id);
    if (idx >= 0) metalsAfter[idx] = { ...metalsAfter[idx], ounces: plan.holdingAfter.shares };
  }

  const worthBefore = netWorth(cashBefore, stocks, metals, rates, spot);
  const worthAfter = netWorth(cashAfter, stocksAfter, metalsAfter, rates, spot);

  const preview = {
    dryRun: !apply,
    transactionId: plan.transactionId,
    userId,
    ticker: plan.ticker,
    assetType: plan.assetType,
    assetName: plan.assetName,
    side: plan.side,
    cash: { before: round2(cashBefore), after: cashAfter, delta: plan.cashDeltaNzd },
    holding: {
      action: plan.holdingAction,
      target: stock ? "stock" : precious ? "precious_metal" : "none",
      before: plan.holdingBefore,
      after: plan.holdingAfter,
    },
    netWorthNzd: { before: worthBefore, after: worthAfter },
  };

  if (!apply) return preview;

  if (stock && plan.holdingAction === "delete") {
    await totalumSdk.crud.deleteRecordById("stock", stock._id);
  } else if (stock && plan.holdingAfter && plan.holdingAction === "update") {
    await totalumSdk.crud.editRecordById("stock", stock._id, {
      shares: plan.holdingAfter.shares,
      purchase_price: plan.holdingAfter.averageCost,
    });
  } else if (stock && plan.holdingAction === "create" && plan.holdingAfter) {
    await totalumSdk.crud.editRecordById("stock", stock._id, {
      shares: plan.holdingAfter.shares,
      purchase_price: plan.holdingAfter.averageCost,
    });
  } else if (!stock && plan.holdingAction === "create" && plan.holdingAfter && ticker) {
    await totalumSdk.crud.createRecord("stock", {
      ticker,
      asset_type: assetType === "metal" ? "metal" : assetType === "crypto" ? "crypto" : "stock",
      company_name: plan.assetName || ticker,
      shares: plan.holdingAfter.shares,
      purchase_price: plan.holdingAfter.averageCost,
      current_price: plan.holdingAfter.averageCost,
      user: userId,
    });
  } else if (!stock && precious && plan.holdingAction === "delete") {
    await totalumSdk.crud.deleteRecordById("precious_metal", precious._id);
  } else if (!stock && precious && plan.holdingAfter && plan.holdingAction === "update") {
    await totalumSdk.crud.editRecordById("precious_metal", precious._id, {
      ounces: plan.holdingAfter.shares,
    });
  } else if (!stock && !precious && plan.holdingAction === "create" && plan.holdingAfter && key) {
    await totalumSdk.crud.createRecord("precious_metal", {
      metal: key,
      ounces: plan.holdingAfter.shares,
      purchase_price_per_oz: plan.holdingAfter.averageCost,
      user: userId,
    });
  }

  await totalumSdk.crud.editRecordById("user", userId, { cash_balance: cashAfter });
  await totalumSdk.crud.deleteRecordById("transaction", transactionId);

  return { ...preview, dryRun: false, removed: true };
}
