import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { HEADMASTER_GOALS } from "@/lib/feature-flags";
import { isFreeReportPlan } from "@/lib/entitlements";
import GoalsWorkflow from "@/components/dashboard/GoalsWorkflow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goals · AetherForge AI", robots: { index: false, follow: false } };

/** b26 H-11: dated NZ$ goals (Starter, Pro and Ultimate). Illustrative, not a forecast. */
export default async function Page() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl font-bold">Goals</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Set a dated NZ$ target, a starting amount and a monthly amount. The projection uses the same maths as a spreadsheet FV() and is illustrative, not a forecast or advice.
      </p>
      {!HEADMASTER_GOALS ? (
        <p className="mt-6 rounded-md border p-4 text-sm" role="status">Goals are not switched on yet.</p>
      ) : !user ? (
        <p className="mt-6 text-sm"><Link className="underline" href="/login?redirect=/dashboard/goals">Sign in</Link> to set goals.</p>
      ) : isFreeReportPlan(user.subscription_plan) ? (
        <p className="mt-6 rounded-md border p-4 text-sm">Goals are included on Starter and above. <Link className="underline" href="/pricing">See plans</Link>. All prices in NZD.</p>
      ) : (
        <GoalsWorkflow />
      )}
    </main>
  );
}
