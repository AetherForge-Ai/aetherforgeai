"use client";

import { useCallback, useEffect, useState } from "react";
import type { WatchAlert, WatchKind, WatchNotice } from "@/lib/holding-alert";
import { WATCH_KINDS, WATCH_POLL_MS, watchKindLabel } from "@/lib/watch-alerts";

/**
 * Goal b10 G-04: Alerts v1. Price level, % move, holding news and ex-dividend
 * watches. Notices show in the app with source and time; nothing is emailed.
 * Refreshes every 60 s. Test mode: add ?simulate=TICKER:price:changePct to the
 * page URL and the refresh uses that quote (labelled "Simulated test quote").
 */
export default function WatchAlerts({ canCreate }: { canCreate: boolean }) {
  const [watches, setWatches] = useState<WatchAlert[]>([]);
  const [notices, setNotices] = useState<WatchNotice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ ticker: string; kind: WatchKind; level: string; side: "above" | "below"; movePct: string; exDate: string }>({
    ticker: "",
    kind: "price_level",
    level: "",
    side: "above",
    movePct: "5",
    exDate: "",
  });

  const refresh = useCallback(async () => {
    const page = typeof window !== "undefined" ? new URL(window.location.href).searchParams : new URLSearchParams();
    const qs = new URLSearchParams();
    if (page.get("simulate")) qs.set("simulate", page.get("simulate")!);
    if (page.get("simulateNews")) qs.set("simulateNews", page.get("simulateNews")!);
    const res = await fetch(`/api/watches${qs.toString() ? `?${qs}` : ""}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { watches: WatchAlert[]; notices: WatchNotice[] } };
    if (json.ok && json.data) {
      setWatches(json.data.watches);
      setNotices(json.data.notices);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), WATCH_POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/watches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticker: form.ticker,
        kind: form.kind,
        level: Number(form.level),
        side: form.side,
        movePct: Number(form.movePct),
        exDate: form.exDate,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!json.ok) setError(json.error || "The alert was not saved.");
    else {
      setForm((f) => ({ ...f, ticker: "" }));
      void refresh();
    }
  }

  async function setStatus(id: string, status: "active" | "paused") {
    await fetch(`/api/alerts/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    void refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    void refresh();
  }

  return (
    <section aria-labelledby="watch-alerts-heading" className="rounded-xl border p-4">
      <h2 id="watch-alerts-heading" className="text-lg font-semibold">Alerts</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Price level, % move, holding news and ex-dividend alerts. They show here with their source and time, and refresh every minute. They are not emailed.
      </p>

      <div className="mt-4" aria-live="polite">
        <h3 className="text-sm font-semibold">Fired on the last refresh</h3>
        {!loaded ? (
          <p className="text-sm text-muted-foreground">Loading alerts…</p>
        ) : notices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alert has fired on the last refresh.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {notices.map((n) => (
              <li key={n.id} data-watch-notice={n.kind} className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                <p className="font-semibold">{n.subject} · {watchKindLabel(n.kind)}</p>
                <p className="whitespace-pre-line text-muted-foreground">{n.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold">Your alerts</h3>
        {loaded && watches.length === 0 ? <p className="text-sm text-muted-foreground">No alerts yet.</p> : null}
        <ul className="mt-2 divide-y">
          {watches.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <strong>{w.ticker}</strong> · {watchKindLabel(w.kind)}
                {w.kind === "price_level" ? ` ${w.side} ${w.level}` : w.kind === "percent_move" ? ` ±${w.movePct}%` : w.kind === "ex_dividend" ? ` ${w.exDate}` : ""}
                {w.status === "paused" ? " · Unsubscribed" : ""}
              </span>
              <span className="flex gap-2">
                <button type="button" className="rounded border px-2 py-1" onClick={() => void setStatus(w.id, w.status === "paused" ? "active" : "paused")}>
                  {w.status === "paused" ? "Resubscribe" : "Unsubscribe"}
                </button>
                <button type="button" className="rounded border px-2 py-1" onClick={() => void remove(w.id)}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {canCreate ? (
        <form onSubmit={create} className="mt-4 grid gap-2 sm:grid-cols-3">
          <label className="text-sm">Ticker<input required value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-1" /></label>
          <label className="text-sm">Type
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as WatchKind })} className="mt-1 w-full rounded-md border px-2 py-1">
              {WATCH_KINDS.map((k) => <option key={k} value={k}>{watchKindLabel(k)}</option>)}
            </select>
          </label>
          {form.kind === "price_level" ? (
            <>
              <label className="text-sm">Level<input required type="number" step="any" min="0" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-1" /></label>
              <label className="text-sm">When price is
                <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as "above" | "below" })} className="mt-1 w-full rounded-md border px-2 py-1">
                  <option value="above">at or above</option>
                  <option value="below">at or below</option>
                </select>
              </label>
            </>
          ) : null}
          {form.kind === "percent_move" ? (
            <label className="text-sm">Move of at least (%)<input required type="number" step="any" min="0" max="100" value={form.movePct} onChange={(e) => setForm({ ...form, movePct: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-1" /></label>
          ) : null}
          {form.kind === "ex_dividend" ? (
            <label className="text-sm">Ex-dividend date<input required type="date" value={form.exDate} onChange={(e) => setForm({ ...form, exDate: e.target.value })} className="mt-1 w-full rounded-md border px-2 py-1" /></label>
          ) : null}
          <div className="sm:col-span-3">
            <button type="submit" className="h-9 rounded-md bg-[#047857] px-4 text-sm font-semibold text-white">Add alert</button>
            {error ? <p role="alert" className="mt-2 text-sm text-rose-500">{error}</p> : null}
          </div>
        </form>
      ) : (
        <p className="mt-4 text-sm"><a href="/pricing" className="text-primary hover:underline">Price alerts: Starter and above</a></p>
      )}
    </section>
  );
}
