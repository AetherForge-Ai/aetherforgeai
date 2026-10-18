import { notFound } from "next/navigation";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";
import { runTrackRecord } from "@/lib/track-record-run.server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Track record scorecard (test) · AetherForge AI", robots: { index: false, follow: false } };

/**
 * Goal b22 G-20: one scorecard for allow-listed test accounts, without CRON_SECRET.
 * Read-only. Nothing here is published; pending calls stay pending.
 */
export default async function Page() {
  if (!(await currentUserMayUseTestHooks())) notFound();
  const run = await runTrackRecord().catch((err: unknown) => ({ error: err instanceof Error ? err.message.slice(0, 120) : "error" }));
  if ("error" in run) {
    return <main className="mx-auto max-w-4xl p-6"><h1 className="text-xl font-semibold">Track record (test)</h1><p data-track-error>Could not build the scorecard: {run.error}</p></main>;
  }
  // b24 SECURITY: totals only. No member tickers, signals, report ids or per-call rows.
  const verifiedOk = run.verified.filter((v) => v.ok).length;
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6" data-track-record>
      <h1 className="text-xl font-semibold">Track record scorecard (test view, not published)</h1>
      <p className="text-sm" data-track-totals>
        Week {run.card.week} · reports read {run.reportsRead} · calls {run.card.calls.length} · hits {run.card.hits} · misses {run.card.misses} · pending{" "}
        {run.card.pending} · unscored {run.card.unscored} · later prices fetched {run.laterPrices.fetched}, reused {run.laterPrices.reused}
      </p>
      <p className="text-sm">
        Scorecard hash <code data-scorecard-hash>{run.card.scorecardHash}</code>. Call hashes re-verified on the server:{" "}
        <span data-verified-count>{verifiedOk} of {run.verified.length}</span>. Misses are counted with the rest.
      </p>
      {run.card.calls.length === 0 ? <p>— No calls in the last 14 days of saved reports.</p> : null}
    </main>
  );
}
