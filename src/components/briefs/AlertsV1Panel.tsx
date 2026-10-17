"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ALERT_RULES_KEY, evaluateAlerts, type AlertFeed, type AlertKind, type AlertRule, type FiredAlert } from "@/lib/alerts-v1";

const KIND_LABEL: Record<AlertKind, string> = {
  price_level: "Price level",
  pct_move: "% move since previous close",
  holding_news: "News mentioning the ticker",
  ex_dividend: "Ex-dividend date",
};
const POLL_MS = 60_000;

function readRules(): AlertRule[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(ALERT_RULES_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/** Goal b17 G-04: in-app Alerts v1. Checks every minute while open. No email. */
export function AlertsV1Panel() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [fired, setFired] = useState<FiredAlert[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [form, setForm] = useState<{ kind: AlertKind; ticker: string; threshold: string; direction: "above" | "below" }>({ kind: "price_level", ticker: "", threshold: "", direction: "above" });
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => setRules(readRules()), []);
  const save = (next: AlertRule[]) => {
    setRules(next);
    window.localStorage.setItem(ALERT_RULES_KEY, JSON.stringify(next));
  };

  const runRef = useRef(0);
  const check = useCallback(async (current: AlertRule[]) => {
    const run = ++runRef.current;
    const [snap, news] = await Promise.all([
      fetch("/api/portfolio/snapshot", { cache: "no-store" }).then((r) => r.json() as Promise<any>).catch(() => null),
      fetch("/api/news").then((r) => r.json() as Promise<any>).catch(() => null),
    ]);
    const positions = (snap?.data?.groups ?? []).flatMap((g: any) => g.positions ?? []);
    const feed: AlertFeed = {
      quotes: positions
        .filter((p: any) => p.marketPriceLocal > 0)
        .map((p: any) => ({ ticker: p.ticker, price: p.marketPriceLocal, previousClose: null, currency: p.currency, source: p.priceSource || "Stored price", quotedAt: p.priceAsOf || snap?.data?.asOf })),
      news: (news?.news ?? [])
        .filter((n: any) => n.publishedOn)
        .map((n: any) => ({
          headline: n.headline,
          tickers: current.filter((r) => new RegExp(`\\b${r.ticker.replace(/\..*$/, "").replace(/[^A-Z0-9]/gi, "")}\\b`, "i").test(n.headline)).map((r) => r.ticker),
          source: n.source,
          publishedAt: n.publishedOn,
          url: n.url,
        })),
      dividends: [],
    };
    if (run !== runRef.current) return;
    const gaps: string[] = [];
    if (current.some((r) => r.active && r.kind === "pct_move")) gaps.push("% move alerts: — the previous close is not stored for your holdings yet, so they cannot fire.");
    if (current.some((r) => r.active && r.kind === "ex_dividend")) gaps.push("Ex-dividend alerts: — no ex-dividend date feed is connected yet (NZX data decision pending), so they cannot fire.");
    setNotes(gaps);
    setFired(evaluateAlerts(current, feed));
    setCheckedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    void check(rules);
    const id = window.setInterval(() => void check(readRules()), POLL_MS);
    return () => window.clearInterval(id);
  }, [rules, check]);

  const add = () => {
    const ticker = form.ticker.trim().toUpperCase();
    if (!ticker) return;
    const threshold = form.threshold === "" ? undefined : Number(form.threshold);
    save([...rules, { id: `r-${Date.now()}`, kind: form.kind, ticker, threshold, direction: form.direction, active: true }]);
    setForm({ ...form, ticker: "", threshold: "" });
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5" aria-labelledby="alerts-v1-title">
      <header>
        <h1 id="alerts-v1-title" className="font-display text-2xl font-bold">Alerts</h1>
        <p className="text-sm text-muted-foreground">In-app alerts for price levels, % moves, news and ex-dividend dates. Checked every minute while this page is open. Each alert shows its source and time. Nothing is emailed.</p>
      </header>
      <section className="space-y-2 rounded-2xl border border-border/70 p-4" aria-label="New alert">
        <div className="flex flex-wrap gap-2 text-sm">
          <select aria-label="Alert type" className="rounded-md border border-border px-2 py-1" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AlertKind })}>
            {(Object.keys(KIND_LABEL) as AlertKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <input aria-label="Ticker" placeholder="Ticker, e.g. FPH.NZ" className="rounded-md border border-border px-2 py-1" value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })} />
          {form.kind !== "holding_news" ? (
            <input aria-label={form.kind === "ex_dividend" ? "Days ahead" : form.kind === "pct_move" ? "Percent" : "Level"} inputMode="decimal" placeholder={form.kind === "ex_dividend" ? "Days ahead" : form.kind === "pct_move" ? "%" : "Level"} className="w-28 rounded-md border border-border px-2 py-1" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
          ) : null}
          {form.kind === "price_level" ? (
            <select aria-label="Direction" className="rounded-md border border-border px-2 py-1" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as "above" | "below" })}>
              <option value="above">At or above</option>
              <option value="below">At or below</option>
            </select>
          ) : null}
          <button type="button" className="rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground" onClick={add}>Add alert</button>
        </div>
      </section>
      <section aria-label="Your alerts">
        <h2 className="font-display text-lg font-semibold">Your alerts</h2>
        {rules.length === 0 ? <p className="text-sm text-muted-foreground">No alerts yet.</p> : null}
        <ul className="mt-2 space-y-1 text-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2" data-alert-rule>
              <span>{KIND_LABEL[r.kind]} · {r.ticker}{r.threshold != null ? ` · ${r.threshold}` : ""}{r.kind === "price_level" ? ` (${r.direction})` : ""}</span>
              <button type="button" className="text-xs underline" onClick={() => save(rules.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)))} data-alert-unsubscribe>
                {r.active ? "Unsubscribe" : "Resubscribe"}
              </button>
              <button type="button" className="text-xs underline" onClick={() => save(rules.filter((x) => x.id !== r.id))}>Delete</button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Triggered">
        <h2 className="font-display text-lg font-semibold">Triggered</h2>
        {notes.map((n) => <p key={n} className="text-xs text-muted-foreground">{n}</p>)}
        {fired.length === 0 ? <p className="text-sm text-muted-foreground">Nothing has triggered.</p> : null}
        <ul className="mt-2 space-y-2 text-sm">
          {fired.map((a) => (
            <li key={`${a.ruleId}-${a.at}`} data-alert-fired className="rounded-xl border border-border/70 p-3">
              {a.message}
              <span className="block text-xs text-muted-foreground">Source: {a.source} · {a.atLabel} (NZ time)</span>
            </li>
          ))}
        </ul>
        {checkedAt ? <p className="mt-2 text-xs text-muted-foreground">Last checked {new Date(checkedAt).toLocaleTimeString("en-NZ", { timeZone: "Pacific/Auckland" })} (NZ time).</p> : null}
      </section>
    </main>
  );
}
