import { notFound } from "next/navigation";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";
import { runTrackRecordBounded } from "@/lib/track-record-run.server";
import { CALL_HASH_FIELDS, sha256Hex } from "@/lib/track-record";
import { formatDisplayDateTime } from "@/lib/currency";

export const dynamic = "force-dynamic";
export const metadata = { title: "Track record scorecard (test) · AetherForge AI", robots: { index: false, follow: false } };

/**
 * Goal b22 G-20: one scorecard for allow-listed test accounts, without CRON_SECRET.
 * Read-only. Nothing here is published; pending calls stay pending.
 */
export default async function Page() {
  if (!(await currentUserMayUseTestHooks())) notFound();
  const out = await runTrackRecordBounded();
  if ("error" in out) {
    return <main className="mx-auto max-w-4xl p-6"><h1 className="text-xl font-semibold">Track record (test)</h1><p data-track-error role="alert">Could not build the scorecard: {out.error}</p></main>;
  }
  const run = out.run;
  // b26 G-20: recompute the scorecard hash from its body so the check is visible without per-call rows.
  const { scorecardHash, published: _published, ...body } = run.card;
  void _published;
  const canon = (v: unknown): string =>
    Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v);
  const recomputed = await sha256Hex(canon(body));
  const totalsAddUp = run.card.hits + run.card.misses + run.card.pending + run.card.unscored === run.card.calls.length;
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
      <p className="text-sm" data-hash-check>
        Recomputed now: {recomputed === scorecardHash ? "matches" : "does not match"}. Hits + misses + pending + unscored = {run.card.hits + run.card.misses + run.card.pending + run.card.unscored} of {run.card.calls.length} calls ({totalsAddUp ? "every call counted, misses included" : "count mismatch"}).
        {out.cachedAt ? ` Cached run from ${formatDisplayDateTime(new Date(out.cachedAt).toISOString())} (NZ time).` : ""}
      </p>
      <details className="text-sm" data-hash-howto>
        <summary>How to verify the hash</summary>
        <p>Algorithm: SHA-256, lowercase hex. Input: the scorecard body as canonical JSON (object keys sorted A–Z at every level, no spaces), with fields <code>week</code>, <code>calls</code>, <code>hits</code>, <code>misses</code>, <code>pending</code>, <code>unscored</code>. Each entry in <code>calls</code> has <code>hash</code>, <code>ticker</code>, <code>signal</code>, <code>result</code> (hit, miss, pending or unscored). Each call hash is SHA-256 of canonical JSON of <code>{CALL_HASH_FIELDS.join(", ")}</code>. The full body is published only with the public scorecard; this test view shows totals only.</p>
      </details>
      {run.card.calls.length === 0 ? <p>— No calls in the last 14 days of saved reports.</p> : null}
    </main>
  );
}
