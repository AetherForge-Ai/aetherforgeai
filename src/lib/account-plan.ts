import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { aucklandMonthKey, countReportsInAucklandMonth } from "@/lib/entitlements";
import { describeAccountPlan, type PlanSnapshot } from "@/lib/plan-usage";
import type { AppUser } from "@/lib/session";

async function countHoldings(userId: string): Promise<number | null> {
  try {
    const res = await totalumSdk.crud.query("stock", {
      _filter: { user: userId },
      _limit: 500,
    });
    return ((res?.data as unknown[]) || []).length;
  } catch (err) {
    console.error("[account-plan] Holdings count failed:", err);
    return null;
  }
}

async function countReports(userId: string, now: number): Promise<number | null> {
  try {
    const res = await totalumSdk.crud.query("report", {
      _filter: { user: userId },
      _sort: { createdAt: "desc" },
      _limit: 200,
    });
    const rows = (res?.data as unknown as { generated_at?: string; createdAt?: string }[]) || [];
    return countReportsInAucklandMonth(
      rows.map((row) => row.generated_at || row.createdAt),
      now,
    );
  } catch (err) {
    console.error("[account-plan] Report count failed:", err);
    return null;
  }
}

async function countAssistant(userId: string, now: number): Promise<number | null> {
  try {
    const month = aucklandMonthKey(now);
    const res = await totalumSdk.crud.query("chat_message", {
      _filter: { user: userId },
      _sort: { createdAt: "desc" },
      _limit: 200,
    });
    const rows =
      (res?.data as { role?: string; createdAt?: string | Date; created_at?: string | Date }[]) || [];
    return rows.filter((row) => {
      if (row.role && row.role !== "user") return false;
      const created = row.createdAt || row.created_at;
      if (!created) return false;
      const t = new Date(created).getTime();
      return !Number.isNaN(t) && aucklandMonthKey(t) === month;
    }).length;
  } catch (err) {
    console.error("[account-plan] Assistant count failed:", err);
    return null;
  }
}

export async function loadAccountPlan(user: AppUser, now = Date.now()): Promise<PlanSnapshot> {
  const [holdingsUsed, reportsUsed, assistantUsed] = await Promise.all([
    countHoldings(user._id),
    countReports(user._id, now),
    countAssistant(user._id, now),
  ]);
  return describeAccountPlan({
    plan: user.subscription_plan,
    status: user.subscription_status,
    expiresAt: user.subscription_expires_at,
    holdingsUsed,
    reportsUsed,
    assistantUsed,
    tickerLimit: user.ticker_limit,
  });
}
