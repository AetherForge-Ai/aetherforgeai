"use client";

import { useEffect, useState } from "react";
import { BRIEF_OPT_OUT_KEY, type MondayBrief } from "@/lib/monday-brief";
import { formatDisplayDate } from "@/lib/currency";

function lastMonday(now = new Date()): string {
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(now);
  const d = new Date(`${local}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Goal b17 G-03: in-app Monday Briefing with an opt-out. */
export function MondayBriefPanel() {
  const [optedOut, setOptedOut] = useState<boolean | null>(null);
  const [brief, setBrief] = useState<MondayBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOptedOut(window.localStorage.getItem(BRIEF_OPT_OUT_KEY) === "1");
  }, []);

  useEffect(() => {
    if (optedOut !== false) return;
    let cancelled = false;
    (async () => {
      try {
        const [snap, news] = await Promise.all([
          fetch("/api/portfolio/snapshot", { cache: "no-store" }).then((r) => r.json() as Promise<any>),
          fetch("/api/news").then((r) => r.json() as Promise<any>).catch(() => ({ news: [] }) as any),
        ]);
        const data = snap?.data;
        const positions = (data?.groups ?? []).flatMap((g: any) =>
          (g.positions ?? []).filter((p: any) => !p.closed).map((p: any) => ({
            ticker: p.ticker,
            name: p.name,
            valueNzd: p.marketValue?.value ?? null,
            priceAsOf: p.priceAsOf ?? null,
            priceSource: p.priceSource ?? null,
          }))
        );
        const res = await fetch("/api/brief", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            weekOf: lastMonday(),
            netWorthNzd: data?.kpis?.netWorth?.value ?? null,
            bookAsOf: data?.asOf,
            bookSource: data?.source,
            positions,
            news: (news?.news ?? [])
              .filter((n: any) => n.publishedOn)
              .map((n: any) => ({ headline: n.headline, source: n.source, publishedOn: n.publishedOn, url: n.url })),
          }),
        }).then((r) => r.json() as Promise<any>);
        if (!cancelled) {
          if (res?.ok) setBrief(res.brief);
          else setError(res?.error || "The brief is not available.");
        }
      } catch {
        if (!cancelled) setError("The brief could not be built right now.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [optedOut]);

  const toggle = () => {
    const next = !optedOut;
    window.localStorage.setItem(BRIEF_OPT_OUT_KEY, next ? "1" : "0");
    setBrief(null);
    setOptedOut(next);
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5" aria-labelledby="brief-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="brief-title" className="font-display text-2xl font-bold">Monday Briefing</h1>
          <p className="text-sm text-muted-foreground">Explains what changed in your book and the markets, with a dated source on every line. In app only. General information, not financial advice.</p>
        </div>
        <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium" onClick={toggle} data-brief-optout aria-pressed={optedOut === true}>
          {optedOut ? "Turn the Monday Briefing on" : "Turn off the Monday Briefing"}
        </button>
      </header>
      {optedOut ? <p data-brief-off className="text-sm">The Monday Briefing is off. No brief is built while it is off.</p> : null}
      {error ? <p className="text-sm text-muted-foreground">— {error}</p> : null}
      {!optedOut && !brief && !error ? <p className="text-sm text-muted-foreground">Building this week&apos;s brief…</p> : null}
      {brief ? (
        <article data-brief className="space-y-3 rounded-2xl border border-border/70 p-5">
          <h2 className="font-display text-lg font-semibold">{brief.title}</h2>
          <ul className="space-y-2 text-sm">
            {brief.sentences.map((s, i) => (
              <li key={i}>
                {s.text}
                {s.sources.length ? (
                  <span className="ml-1 text-xs text-muted-foreground" data-brief-source>
                    [{s.sources.map((src) => `${src.name}, ${formatDisplayDate(src.date)}`).join("; ")}]
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </article>
      ) : null}
    </main>
  );
}
