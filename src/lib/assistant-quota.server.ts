import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { assistantQueryLimit, aucklandMonthKey } from "@/lib/entitlements";

/**
 * b28 L-4/CR-2: one Market Assistant quota for every signed-in surface (/api/chat and the
 * Assistant panel's /api/portfolio-coach). A question counts once it is answered, refusals
 * and fallback replies included. The count after a question is used+1 from the read made
 * before it, not a re-read, because a re-read right after the write can miss the new row
 * (that is why the panel counter stayed at 0).
 */
export async function assistantUsedThisMonth(userId: string, now = Date.now()): Promise<number> {
  const month = aucklandMonthKey(now);
  const res = await totalumSdk.crud.query("chat_message", {
    _filter: { user: userId },
    _sort: { createdAt: "desc" },
    _limit: 1000,
  });
  const rows = (res?.data as unknown as { role?: string; createdAt?: string | Date; created_at?: string | Date }[]) || [];
  return rows.filter((m) => {
    if (m.role && m.role !== "user") return false;
    const created = m.createdAt || m.created_at;
    if (!created) return false;
    const t = new Date(created).getTime();
    return !Number.isNaN(t) && aucklandMonthKey(t) === month;
  }).length;
}

export type AssistantQuota = { used: number; limit: number | null; remaining: number | null };

export async function readAssistantQuota(user: { _id: string; subscription_plan?: string | null }): Promise<AssistantQuota> {
  const limit = assistantQueryLimit(user.subscription_plan);
  const used = await assistantUsedThisMonth(user._id);
  return { used, limit, remaining: limit == null ? null : Math.max(0, limit - used) };
}

/** Store the question and its reply; return the quota after this question. */
export async function recordAssistantExchange(
  user: { _id: string },
  before: AssistantQuota,
  question: string,
  reply: string
): Promise<AssistantQuota> {
  await totalumSdk.crud.createRecord("chat_message", { role: "user", content: question, user: user._id });
  await totalumSdk.crud.createRecord("chat_message", { role: "assistant", content: reply, user: user._id }).catch(() => null);
  const used = before.used + 1;
  return { used, limit: before.limit, remaining: before.limit == null ? null : Math.max(0, before.limit - used) };
}
