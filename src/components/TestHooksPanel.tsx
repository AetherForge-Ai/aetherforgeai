"use client";

import { useEffect, useState } from "react";
import { FEED_OFF_COOKIE } from "@/lib/test-hooks";
import { ONBOARDING_FUNNEL_KEY } from "@/lib/onboarding-30";

/** Goal b10: test-mode switches for TT's live checks. Affects this browser only. */
export default function TestHooksPanel({ enabled }: { enabled: boolean }) {
  const [feedOff, setFeedOff] = useState(false);
  const [capResult, setCapResult] = useState<string | null>(null);
  async function runCapCheck() {
    setCapResult("Checking…");
    try {
      const res = await fetch("/api/transactions?dryRun=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "buy", ticker: "CAPCHECK.NZ", asset_type: "stock", quantity: 1, price: 1, confirm: true, trade_date: new Date().toISOString().slice(0, 10) }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; dryRun?: boolean };
      if (res.status === 401) setCapResult("Sign in first, then run this again.");
      else if (res.status === 403) setCapResult(`Cap reached (403): ${body.error ?? body.message ?? "holding limit"}`);
      else if (res.ok && body.dryRun) setCapResult("Under the cap: this buy would be allowed. Nothing was saved.");
      else setCapResult(`Status ${res.status}: ${body.error ?? body.message ?? "no message"}`);
    } catch {
      setCapResult("Check failed: network error.");
    }
  }
  // Goal b22 G-28: read-only view of this browser's onboarding funnel counts.
  const [funnel, setFunnel] = useState<string>("—");
  useEffect(() => {
    try {
      setFunnel(window.localStorage.getItem(ONBOARDING_FUNNEL_KEY) || "— (no funnel events in this browser yet)");
    } catch {
      setFunnel("— (localStorage not readable)");
    }
  }, []);
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
        <h2 className="font-semibold">Holding cap (CR-6)</h2>
        <p className="text-sm text-muted-foreground">
          Runs a signed-in dry run of one new holding (CAPCHECK.NZ) through every server check, including the plan cap. Nothing is saved.
        </p>
        <button type="button" onClick={runCapCheck} data-cap-check className="mt-2 h-9 rounded-md border px-4 text-sm font-semibold">Run cap dry run</button>
        {capResult && <p className="mt-2 text-sm" data-cap-result role="status">{capResult}</p>}
      </section>
      <section>
        <h2 className="font-semibold">Example data (H-4)</h2>
        <p className="text-sm text-muted-foreground">
          <a className="text-primary hover:underline" href="/test-hooks/dashboard-500">Dashboard ledger with 500 synthetic rows</a>. Labelled example data; nothing is saved.
        </p>
      </section>
      <section>
        <h2 className="font-semibold">Alerts (G-04)</h2>
        <p className="text-sm text-muted-foreground">
          Add alerts on <a className="text-primary hover:underline" href="/dashboard/alerts">Alerts</a>, then open
          <code className="mx-1">/dashboard/alerts?simulate=AIR.NZ:1.20:-6</code>
          (ticker:price:% change) or <code className="mx-1">?simulateNews=AIR.NZ</code>. The alert fires on the next refresh and is labelled “Simulated test quote”. Nothing is saved or emailed.
        </p>
      </section>
      <section className="mt-6 rounded-md border p-4" data-funnel-readout>
        <h2 className="font-semibold">Onboarding funnel (this browser)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Counts stored in localStorage under {ONBOARDING_FUNNEL_KEY}. Read-only.</p>
        <pre className="mt-2 overflow-x-auto text-xs">{funnel}</pre>
      </section>
      <p className="mt-6 text-sm"><a className="underline" href="/test-hooks/track-record">Track record scorecard (test view)</a></p>
    </main>
  );
}
