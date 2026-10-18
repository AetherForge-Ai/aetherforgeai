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
  const ok = new Map(run.verified.map((v) => [v.hash, v.ok]));
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6" data-track-record>
      <h1 className="text-xl font-semibold">Track record scorecard (test view, not published)</h1>
      <p className="text-sm">
        Week {run.card.week} · reports read {run.reportsRead} · calls {run.card.calls.length} · hits {run.card.hits} · misses {run.card.misses} · pending{" "}
        {run.card.pending} · unscored {run.card.unscored} · later prices fetched {run.laterPrices.fetched}, reused {run.laterPrices.reused} ({run.laterPrices.store})
      </p>
      <p className="text-sm">
        Scorecard hash <code data-scorecard-hash>{run.card.scorecardHash}</code>. Each call hash is SHA-256 of the call&apos;s canonical JSON
        (keys sorted, without the hash field); &quot;verified&quot; recomputes it on the server. Losers (misses) are listed with the rest.
      </p>
      <table className="w-full text-sm">
        <thead><tr><th className="text-left">Ticker</th><th className="text-left">Signal</th><th className="text-left">Result</th><th className="text-left">Hash</th><th className="text-left">Verified</th></tr></thead>
        <tbody>
          {run.card.calls.map((c) => (
            <tr key={c.hash}><td>{c.ticker}</td><td>{c.signal}</td><td>{c.result}</td><td><code>{c.hash.slice(0, 16)}…</code></td><td>{ok.get(c.hash) ? "yes" : "no"}</td></tr>
          ))}
        </tbody>
      </table>
      {run.card.calls.length === 0 ? <p>— No calls in the last 14 days of saved reports.</p> : null}
    </main>
  );
}
