"use client";

import { useEffect, useState } from "react";
import { FEED_OFF_COOKIE } from "@/lib/test-hooks";

/** Goal b10: test-mode switches for TT's live checks. Affects this browser only. */
export default function TestHooksPanel({ enabled }: { enabled: boolean }) {
  const [feedOff, setFeedOff] = useState(false);
  useEffect(() => {
    setFeedOff(document.cookie.split(";").some((c) => c.trim() === `${FEED_OFF_COOKIE}=1`));
  }, []);
  function toggle() {
    const next = !feedOff;
    document.cookie = next ? `${FEED_OFF_COOKIE}=1; path=/; max-age=3600; samesite=lax` : `${FEED_OFF_COOKIE}=; path=/; max-age=0`;
    setFeedOff(next);
  }
  if (!enabled) return <main className="mx-auto max-w-xl p-6"><h1 className="text-xl font-semibold">Test-mode hooks are off</h1></main>;
  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Test-mode hooks</h1>
      <section>
        <h2 className="font-semibold">Price feed (G-05)</h2>
        <p className="text-sm text-muted-foreground">
          Switching the feed off makes the price tape refresh fail for this browser only. Price dots turn amber after one missed refresh (about 1 minute) and red after two.
        </p>
        <p className="mt-2 text-sm">Feed is <strong data-feed-state>{feedOff ? "off" : "on"}</strong>.</p>
        <button type="button" onClick={toggle} className="mt-2 h-9 rounded-md border px-4 text-sm font-semibold">
          {feedOff ? "Switch feed back on" : "Switch feed off"}
        </button>
      </section>
      <section>
        <h2 className="font-semibold">Alerts (G-04)</h2>
        <p className="text-sm text-muted-foreground">
          Add alerts on <a className="text-primary hover:underline" href="/dashboard/alerts">Alerts</a>, then open
          <code className="mx-1">/dashboard/alerts?simulate=AIR.NZ:1.20:-6</code>
          (ticker:price:% change) or <code className="mx-1">?simulateNews=AIR.NZ</code>. The alert fires on the next refresh and is labelled “Simulated test quote”. Nothing is saved or emailed.
        </p>
      </section>
    </main>
  );
}
