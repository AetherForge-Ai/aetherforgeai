import { notFound } from "next/navigation";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";
import { getCurrentUser } from "@/lib/session";
import { paidFeatureSweep } from "@/lib/paid-features";
import { planLabel } from "@/lib/plans";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paid feature sweep · AetherForge AI", robots: { index: false, follow: false } };

/**
 * b32 L-4: for the signed-in allow-listed test account, every /pricing line for its plan, what
 * the code grants, and where to check it. Read-only. Same gate as /test-hooks.
 */
export default async function Page() {
  if (!(await currentUserMayUseTestHooks())) notFound();
  const user = await getCurrentUser();
  const plan = String(user?.subscription_plan || "free");
  const rows = paidFeatureSweep(plan);
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Paid feature sweep</h1>
      <p className="text-sm">
        Plan: <span data-paid-plan>{planLabel(plan)}</span> ({plan}). {rows.filter((r) => r.ok).length} of {rows.length} lines granted by the code.
        Each row names the page to open and check by hand.
      </p>
      {rows.length === 0 ? <p className="text-sm">This plan has no paid feature lines (Free or a retired plan).</p> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th scope="col" className="py-2 pr-3">Feature on /pricing</th>
            <th scope="col" className="py-2 pr-3">Code grants</th>
            <th scope="col" className="py-2 pr-3">Result</th>
            <th scope="col" className="py-2">Check it on</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.feature} data-paid-feature={row.feature} data-ok={row.ok ? "1" : "0"} className="border-t">
              <td className="py-2 pr-3">{row.feature}</td>
              <td className="py-2 pr-3">{row.granted}</td>
              <td className="py-2 pr-3 font-semibold">{row.ok ? "Granted" : "Not granted"}</td>
              <td className="py-2">{row.where}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
