"use client";

import { useEffect, useState } from "react";

type Received = { id: string; label: string; portfolioId: string };
type View = {
  label: string;
  holdings: { name: string; ticker: string; assetType: string; quantity: number; averageCost: number | null; currency: string }[];
  trades: { date: string; type: string; ticker: string; quantity: number | null; price: number | null; currency: string }[];
};

const fmtDate = (d: string) => {
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-NZ", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : d;
};
const money = (v: number | null, ccy: string) => (v == null ? "—" : `${ccy === "NZD" ? "NZ$" : `${ccy} `}${v.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** b66 G-27: books shared with this account, read-only. Re-checked with the server on every open. */
export function SharedWithMe() {
  const [list, setList] = useState<Received[] | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/share", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { received: Received[] } };
      setList(json.ok && json.data ? json.data.received : []);
    })();
  }, []);
  async function open(id: string) {
    setError(null);
    setView(null);
    const res = await fetch(`/api/share/${encodeURIComponent(id)}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: View; error?: string };
    if (res.ok && json.ok && json.data) setView(json.data);
    else setError(res.status === 404 ? "This share is no longer available." : json.error || "Something went wrong.");
  }
  if (list == null) return <p className="mt-4 text-sm text-muted-foreground">Loading…</p>;
  return (
    <div className="mt-4 space-y-4" data-shared-with-me>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody has shared a book with you yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {list.map((s) => (
            <li key={s.id}>
              <button type="button" className="min-h-11 rounded-md border px-4 font-medium" onClick={() => open(s.id)} data-shared-open>
                Open shared book ({s.label === "accountant" ? "as accountant" : "as family"})
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {view ? (
        <section className="rounded-md border p-4" data-shared-view>
          <p className="text-sm font-medium">Read-only. You can't make changes to this book.</p>
          <h2 className="mt-3 font-semibold">Holdings</h2>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3">Name</th>
                  <th className="py-1 pr-3">Quantity</th>
                  <th className="py-1">Average cost</th>
                </tr>
              </thead>
              <tbody>
                {view.holdings.map((h, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1 pr-3">{h.name} {h.ticker && h.ticker !== h.name ? <span className="text-muted-foreground">({h.ticker})</span> : null}</td>
                    <td className="py-1 pr-3">{h.quantity.toLocaleString("en-NZ", { maximumFractionDigits: 8 })}</td>
                    <td className="py-1">{money(h.averageCost, h.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 className="mt-4 font-semibold">Recent trades</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {view.trades.length === 0 ? <li className="text-muted-foreground">No trades recorded.</li> : null}
            {view.trades.map((t, i) => (
              <li key={i}>
                {fmtDate(t.date)} · {t.type} {t.ticker} {t.quantity != null ? `${t.quantity} @ ${money(t.price, t.currency)}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
