import { totalumSdk } from "@/lib/totalum";
import { aucklandMonthKey } from "@/lib/entitlements";

/**
 * Padded UTC bounds covering the full Pacific/Auckland calendar month for
 * `monthKey` ("yyyy-MM"), widened by a day on each side to safely cover the
 * NZST/NZDT (+12/+13h) offset without a full timezone-conversion library.
 * The DB filter only narrows the candidate rows — exact month membership is
 * re-checked in JS via aucklandMonthKey() on each row in countFreeReportsThisMonth.
 */
function aucklandMonthUtcBoundsPadded(monthKey: string): { gte: string; lte: string } {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(Date.UTC(year, month, 1));
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start.toISOString(), lte: end.toISOString() };
}

/**
 * Reports (any bot) a Free user has generated in the current Pacific/Auckland
 * calendar month. Free's 3-report cap is a single pooled monthly allowance
 * across Stox + Koins — not a per-bot allowance like the paid cadence above.
 */
export async function countFreeReportsThisMonth(userId: string, now: number): Promise<{ count: number; monthKey: string }> {
  const monthKey = aucklandMonthKey(now);
  const { gte, lte } = aucklandMonthUtcBoundsPadded(monthKey);
  const res = await totalumSdk.crud.query("report", {
    _filter: { user: userId, createdAt: { gte, lte } },
    _sort: { createdAt: "desc" },
    _limit: 100,
  });
  const rows = (res?.data as any[]) || [];
  const count = rows.filter(
    (r) => aucklandMonthKey(new Date(r.generated_at || r.createdAt).getTime()) === monthKey
  ).length;
  return { count, monthKey };
}

