/**
 * Archive alerts on flat positions and backfill missing sell fees.
 * Not imported by any page. Dry-run unless the admin route passes apply.
 */

import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { alertsHiddenForFlatPositions, type AlertLifecycleRow } from "@/lib/alert-lifecycle";
import {
  planSellFeeBackfill,
  sumSellFeeCashDelta,
  SELL_FEE_BACKFILL_MARK,
  type SellFeePlan,
  type SellFeeRow,
} from "@/lib/sell-fee-backfill";

export interface MaintenanceChange {
  userId: string;
  alerts: { id: string; ticker: string }[];
  sellFees: SellFeePlan[];
  cashDeltaNzd: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function listUserIds(userId?: string): Promise<string[]> {
  if (userId) return [userId];
  const res = await totalumSdk.crud.query("user", { _limit: 2000 });
  const rows = (res?.data as { _id?: string }[]) || [];
  return rows.map((row) => String(row._id || "")).filter(Boolean);
}

async function planUser(userId: string): Promise<MaintenanceChange> {
  const [alertRes, holdingRes, txRes] = await Promise.all([
    totalumSdk.crud.query("price_alert", { _filter: { user: userId }, _limit: 500 }),
    totalumSdk.crud.query("stock", { _filter: { user: userId }, _limit: 500 }),
    totalumSdk.crud.query("transaction", { _filter: { user: userId, type: "sell" }, _limit: 2000 }),
  ]);
  const alerts: AlertLifecycleRow[] = ((alertRes?.data as { _id?: string; ticker?: string; status?: string }[]) || [])
    .filter((row) => row._id)
    .map((row) => ({
      _id: String(row._id),
      ticker: String(row.ticker || ""),
      status: row.status ?? "active",
    }));
  const holdings = ((holdingRes?.data as { ticker?: string; shares?: number }[]) || []).map((row) => ({
    ticker: String(row.ticker || ""),
    shares: Number(row.shares) || 0,
  }));
  const hidden = alertsHiddenForFlatPositions(alerts, holdings);
  const sellFees = ((txRes?.data as SellFeeRow[]) || [])
    .map((row) => planSellFeeBackfill(row))
    .filter((plan): plan is SellFeePlan => !!plan);
  return {
    userId,
    alerts: hidden.map((alert) => ({ id: alert._id, ticker: alert.ticker })),
    sellFees,
    cashDeltaNzd: sumSellFeeCashDelta(sellFees),
  };
}

export async function planPositionMaintenance(userId?: string): Promise<{
  dryRun: true;
  users: MaintenanceChange[];
}> {
  const ids = await listUserIds(userId);
  const users: MaintenanceChange[] = [];
  for (const id of ids) {
    const change = await planUser(id);
    if (change.alerts.length || change.sellFees.length) users.push(change);
  }
  return { dryRun: true, users };
}

export async function applyPositionMaintenance(userId?: string): Promise<{
  dryRun: false;
  users: MaintenanceChange[];
  alertsArchived: number;
  sellFeesBackfilled: number;
}> {
  const plan = await planPositionMaintenance(userId);
  let alertsArchived = 0;
  let sellFeesBackfilled = 0;
  for (const user of plan.users) {
    for (const alert of user.alerts) {
      await totalumSdk.crud.editRecordById("price_alert", alert.id, { status: "archived" });
      alertsArchived += 1;
    }
    for (const fee of user.sellFees) {
      const existing = await totalumSdk.crud.getRecordById("transaction", fee.id);
      const notes = String((existing as { data?: { notes?: string } })?.data?.notes || "");
      const stamped = notes.includes(SELL_FEE_BACKFILL_MARK)
        ? notes
        : `${notes}${notes ? " " : ""}[${SELL_FEE_BACKFILL_MARK}]`.slice(0, 500);
      const patch: Record<string, unknown> = {
        fees: fee.feeNative,
        fees_native: fee.feeNative,
        fees_nzd: fee.feeNzd,
        notes: stamped,
      };
      if (fee.nextCashNzd != null) {
        patch.cash_nzd = fee.nextCashNzd;
        patch.total = fee.nextCashNzd;
      }
      if (fee.nextRealizedNzd != null) {
        patch.realized_pnl = fee.nextRealizedNzd;
        patch.realized_pnl_nzd = fee.nextRealizedNzd;
      }
      await totalumSdk.crud.editRecordById("transaction", fee.id, patch);
      sellFeesBackfilled += 1;
    }
    if (user.sellFees.length) {
      const userRes = await totalumSdk.crud.getRecordById("user", user.userId);
      const current = Number((userRes as { data?: { cash_balance?: number } })?.data?.cash_balance) || 0;
      await totalumSdk.crud.editRecordById("user", user.userId, {
        cash_balance: round2(current + user.cashDeltaNzd),
      });
    }
  }
  return { dryRun: false, users: plan.users, alertsArchived, sellFeesBackfilled };
}
