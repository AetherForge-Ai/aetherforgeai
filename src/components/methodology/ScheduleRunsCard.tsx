"use client";

import { useEffect, useState } from "react";
import { formatDisplayDateTime } from "@/lib/currency";
import { scheduleHeadline, type PublicScheduleView } from "@/lib/schedule-runs";

/** b37 G-20: public card. Last 3 runs of the track-record job; the page itself stays static. */
export function ScheduleRunsCard() {
  const [view, setView] = useState<PublicScheduleView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/track-record/schedule", { signal: AbortSignal.timeout(5_000) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { data?: PublicScheduleView }) => live && b.data && setView(b.data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  const latest = view ? scheduleHeadline(view) : null;
  return (
    <div className="min-h-[5.5rem] rounded-2xl border border-border/70 bg-card/70 px-5 py-4 text-sm" data-schedule-card data-schedule-source={view?.source ?? ""}>
      <p className="font-semibold" data-built-by-schedule={latest ? "yes" : "no"}>
        {latest
          ? `Built by schedule ${formatDisplayDateTime(latest)} (NZ time)`
          : view
            ? "No scheduled run has been recorded yet."
            : failed
              ? "The run times could not be read just now."
              : "Loading run times…"}
      </p>
      {view && view.runs.length ? (
        <ul className="mt-2 space-y-1 text-muted-foreground">
          {view.runs.map((r) => (
            <li key={r.at} data-schedule-run>
              {formatDisplayDateTime(r.at)} (NZ time) · {r.trigger === "schedule" ? "scheduled" : r.trigger} · {r.outcome}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        The last 3 runs of the track-record job ({view?.source === "github-actions" ? "GitHub Actions" : "stored run log"}). Run times only; results are not published yet.
      </p>
    </div>
  );
}
