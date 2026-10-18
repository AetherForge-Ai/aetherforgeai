import { notFound } from "next/navigation";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";
import { StaleTickerHookPanel } from "./panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stale ticker hook · AetherForge AI", robots: { index: false, follow: false } };

/** 404 unless GOAL_TEST_HOOKS=1 and the account is allow-listed. */
export default async function Page() {
  if (!(await currentUserMayUseTestHooks())) notFound();
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Stale ticker hook</h1>
      <p className="text-sm text-muted-foreground">
        Forces one ticker’s last price to look older than the Hold limit for that market, then resets it.
        The next Stox or Koins report for this browser shows Hold, the reason, and the age. Nothing is saved.
      </p>
      <StaleTickerHookPanel />
    </main>
  );
}
