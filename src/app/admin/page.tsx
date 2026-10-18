import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isOwner, summariseOwnerRows } from "@/lib/owner-admin";
import { normalizePlanKey } from "@/lib/entitlements";
import { totalumSdk } from "@/lib/totalum";
import { loadStatusFeeds } from "@/lib/status-feeds.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner admin — AetherForge AI", robots: { index: false, follow: false } };

const CAP = 1000;

async function rows(table: string): Promise<Array<{ createdAt?: string | null; subscription_plan?: string | null }>> {
  const res = await Promise.race([
    totalumSdk.crud.query(table, { _limit: CAP } as never).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 3_000)),
  ]);
  return ((res as { data?: unknown } | null)?.data as never) || [];
}

/**
 * b36 M-9 (GOAL-LOCK #19): owner-only, read-only diagnostics. Counts only: no member names,
 * emails or holdings. Every view is audited to the server log.
 */
export default async function AdminPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!isOwner(user)) notFound();
  console.info(`[admin-audit] owner view /admin by ${(user as { _id?: string })._id ?? "?"} at ${new Date().toISOString()}`);
  const [users, chats, reports, feeds] = await Promise.all([rows("user"), rows("chat_message"), rows("report"), loadStatusFeeds().catch(() => [])]);
  const s = summariseOwnerRows(users, chats, reports, Date.now(), normalizePlanKey, CAP);
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Owner admin</h1>
      <p className="mt-2 text-sm text-muted-foreground">Read-only. Counts only. Each view is logged.</p>
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Sign-ups</h2>
        <p data-admin-users>
          {s.users}
          {s.capped ? "+" : ""} accounts · {s.signups7d} in 7 days · {s.signups30d} in 30 days
        </p>
      </section>
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Plans</h2>
        <ul data-admin-plans>
          {Object.entries(s.plans).map(([k, n]) => (
            <li key={k}>
              {k}: {n}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-6">
        <h2 className="text-lg font-semibold">AI use (30 days)</h2>
        <p data-admin-ai>
          {s.assistantMessages30d} assistant messages · {s.reports30d} reports. NZ$ spend per call is not recorded yet, so usage is shown as counts.
        </p>
      </section>
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Feed times</h2>
        <ul data-admin-feeds>
          {feeds.map((f) => (
            <li key={f.label}>
              {f.label}: {f.text}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
