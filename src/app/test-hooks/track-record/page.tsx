import { notFound } from "next/navigation";
import { currentUserMayUseTestHooks } from "@/lib/test-hooks.server";
import { loadTrackRecordView } from "@/lib/track-record-store.server";
import { runTrackRecordBounded } from "@/lib/track-record-run.server";
import { seedTrackRecordStore, storedCardIsStale, TRACK_LIVE_WAIT_MS } from "@/lib/track-record-seed.server";
import { snapshotFromRun, viewFromStoredJson, type TrackRecordView } from "@/lib/track-record-store";
import { CALL_HASH_FIELDS } from "@/lib/track-record";
import { formatDisplayDateTime } from "@/lib/currency";

export const dynamic = "force-dynamic";
export const metadata = { title: "Track record scorecard (test) · AetherForge AI", robots: { index: false, follow: false } };

/**
 * G-20: allow-listed test accounts read the scorecard the cron stored.
 * This page does not build a scorecard. Totals only.
 */
export default async function Page() {
  if (!(await currentUserMayUseTestHooks())) notFound();
  const out = await loadTrackRecordView();
  // Review fix (b28): until the cron has stored a card, or when the stored card cannot be read,
  // fall back to the b27 bounded live build (10 s cap, 10 min cache) so the page never shows less
  // than it did before this change.
  let view: TrackRecordView | null = out.kind === "ready" ? out.view : null;
  let source: "stored" | "live" = "stored";
  let liveError = "";
  // b29 G-20: stored card first. Missing or older than a day → seed the store in the background.
  if (!view || storedCardIsStale(view.storedAt)) seedTrackRecordStore();
  if (!view) {
    const live = await runTrackRecordBounded(Date.now(), undefined, TRACK_LIVE_WAIT_MS);
    if ("error" in live) liveError = live.error;
    else {
      view = await viewFromStoredJson(JSON.stringify(snapshotFromRun(live.run, new Date(live.cachedAt ?? Date.now()).toISOString())));
      source = "live";
    }
  }
  if (!view) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-6" data-track-record>
        <h1 className="text-xl font-semibold">Track record scorecard (test view, not published)</h1>
        {out.kind === "missing" ? (
          <p data-track-missing>No scorecard is stored yet, and a live build did not finish: {liveError || "unknown error"}. Reload in a minute.</p>
        ) : (
          <p data-track-error role="alert">{out.kind === "error" ? out.error : ""} A live build did not finish: {liveError || "unknown error"}.</p>
        )}
      </main>
    );
  }
  const sum = view.hits + view.misses + view.pending + view.unscored;
  const history =
    view.calls === 0
      ? "No calls in the last 14 days of saved reports. The counts above are that collection."
      : view.hits + view.misses === 0
        ? "Not enough later prices are stored yet to score a hit or a miss. The counts above are the calls collected so far. Pending calls stay pending. Misses stay in the total."
        : "";
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6" data-track-record data-track-source={source}>
      <h1 className="text-xl font-semibold">Track record scorecard (test view, not published)</h1>
      <p
        className="text-sm"
        data-track-totals
        data-calls={view.calls}
        data-hits={view.hits}
        data-misses={view.misses}
        data-pending={view.pending}
        data-unscored={view.unscored}
        data-reports={view.reportsRead}
      >
        Week {view.week} · {source === "stored" ? "stored" : "built live"} {formatDisplayDateTime(view.storedAt)} (NZ time) · reports read {view.reportsRead} · calls {view.calls} · hits {view.hits} · misses {view.misses} · pending {view.pending} · unscored {view.unscored} · later prices fetched {view.laterFetched}, reused {view.laterReused}
      </p>
      <p className="text-sm">
        Scorecard hash <code data-scorecard-hash={view.scorecardHash}>{view.scorecardHash}</code>. Call hashes checked when this card was stored:{" "}
        <span data-verified-count>{view.verifiedOk} of {view.verifiedTotal}</span>. Misses are counted with the rest.
      </p>
      <p className="text-sm" data-hash-check data-hash-matches={view.hashMatches ? "yes" : "no"}>
        Recomputed now: {view.hashMatches ? "matches" : "does not match"}. Hits + misses + pending + unscored = {sum} of {view.calls} calls ({view.totalsAddUp ? "every call counted, misses included" : "count mismatch"}).
      </p>
      {history ? <p className="text-sm" data-track-history>{history}</p> : null}
      <details className="text-sm" data-hash-howto>
        <summary>How to verify the hash</summary>
        <p>Algorithm: SHA-256, lowercase hex. Input: the scorecard body as canonical JSON (object keys sorted A–Z at every level, no spaces), with fields <code>week</code>, <code>calls</code>, <code>hits</code>, <code>misses</code>, <code>pending</code>, <code>unscored</code>. Each entry in <code>calls</code> has <code>hash</code>, <code>ticker</code>, <code>signal</code>, <code>result</code> (hit, miss, pending or unscored). Each call hash is SHA-256 of canonical JSON of <code>{CALL_HASH_FIELDS.join(", ")}</code>. This page recomputes the scorecard hash from the stored body and shows whether it matches. The full body stays in the store. This test view shows totals only.</p>
      </details>
    </main>
  );
}
