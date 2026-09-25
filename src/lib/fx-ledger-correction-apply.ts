/**
 * Apply `planLedgerFxCorrection` to one account. Not imported by any page.
 * Invoke only via POST /api/admin/fx-ledger-correction with AF_FX_CORRECTION_TOKEN.
 */

import "server-only";
import { totalumSdk } from "@/lib/totalum";
import {
  FX_CORRECTION_MARK,
  planLedgerFxCorrection,
  sumCorrectionDelta,
  type LedgerFxRow,
} from "@/lib/fx-ledger-correction";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function applyLedgerFxCorrection(userId: string): Promise<{
  corrected: number;
  deltaCash: number;
  cashBalance: number;
}> {
  const res = await totalumSdk.crud.query("transaction", {
    _filter: { user: userId },
    _limit: 5000,
  });
  const rows = ((res?.data as LedgerFxRow[]) || []).filter((r) => r && r._id);
  const plans = rows.map((row) => planLedgerFxCorrection(row)).filter((p): p is NonNullable<typeof p> => !!p);

  for (const plan of plans) {
    await totalumSdk.crud.editRecordById("transaction", plan.id, {
      cash_nzd: plan.cashNzd,
      total: plan.cashNzd,
      fees_nzd: plan.feesNzd,
      fx_rate: plan.fxRate,
      fx_direction_corrected: FX_CORRECTION_MARK,
    });
  }

  const userRes = await totalumSdk.crud.getRecordById("user", userId);
  const current = Number((userRes as { data?: { cash_balance?: number } })?.data?.cash_balance) || 0;
  const deltaCash = sumCorrectionDelta(plans);
  const cashBalance = round2(current + deltaCash);
  if (plans.length) {
    await totalumSdk.crud.editRecordById("user", userId, { cash_balance: cashBalance });
  }

  console.log(
    `[fx-ledger] user ${userId}: corrected ${plans.length} row(s), cash delta ${deltaCash}, balance ${cashBalance}`
  );
  return { corrected: plans.length, deltaCash, cashBalance };
}
