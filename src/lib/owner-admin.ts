import { PRIVACY_OFFICER_EMAIL } from "@/lib/public-copy";

/**
 * b36 M-9 (GOAL-LOCK #19): the owner is the privacy-officer account (the same rule the existing
 * /api/admin/crypto-diagnostics uses). Everyone else gets 404.
 */
export function isOwner(user: { email?: string | null } | null | undefined): boolean {
  return !!user?.email && user.email.trim().toLowerCase() === PRIVACY_OFFICER_EMAIL.toLowerCase();
}

export interface OwnerSummary {
  users: number;
  capped: boolean;
  signups7d: number;
  signups30d: number;
  plans: Record<string, number>;
  assistantMessages30d: number;
  reports30d: number;
}

type Row = { createdAt?: string | null; subscription_plan?: string | null };

/** Pure: counts from already-read rows (no names, no emails). */
export function summariseOwnerRows(users: Row[], chats: Row[], reports: Row[], now: number, normalize: (p?: string | null) => string, cap = 1000): OwnerSummary {
  const within = (r: Row, days: number) => {
    const t = Date.parse(r.createdAt || "");
    return Number.isFinite(t) && now - t <= days * 86_400_000;
  };
  const plans: Record<string, number> = {};
  for (const u of users) {
    const k = normalize(u.subscription_plan);
    plans[k] = (plans[k] ?? 0) + 1;
  }
  return {
    users: users.length,
    capped: users.length >= cap,
    signups7d: users.filter((u) => within(u, 7)).length,
    signups30d: users.filter((u) => within(u, 30)).length,
    plans,
    assistantMessages30d: chats.filter((c) => within(c, 30)).length,
    reports30d: reports.filter((r) => within(r, 30)).length,
  };
}
