"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatDisplayDate, formatNzd } from "@/lib/currency";
import { aucklandYmd } from "@/lib/entitlements";
import {
  KIND_LABEL,
  WEALTH_HISTORY_KEY,
  WEALTH_KEY,
  addHistoryPoint,
  wealthTotals,
  type WealthItem,
  type WealthKind,
  type WealthState,
} from "@/lib/whole-wealth";
import type { PortfolioSnapshot } from "@/lib/portfolio-snapshot";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Goal b19 G-21: whole-wealth NZD book with a net-worth chart and goal gap. */
export function WholeWealthPanel() {
  const [book, setBook] = useState<{ value: number | null; reason: string | null } | null>(null);
  const [state, setState] = useState<WealthState>({ items: [], goalNzd: null });
  const [history, setHistory] = useState<{ day: string; netWorthNzd: number }[]>([]);
  const [kind, setKind] = useState<WealthKind>("kiwisaver");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");

  useEffect(() => {
    setState(load(WEALTH_KEY, { items: [], goalNzd: null }));
    setHistory(load(WEALTH_HISTORY_KEY, []));
    void api.get<PortfolioSnapshot>("/api/portfolio/snapshot").then((res) => {
      const nw = res.ok ? res.data?.kpis.netWorth : null;
      setBook(nw ? { value: nw.value, reason: nw.reason } : { value: null, reason: "The paper book did not load." });
    });
  }, []);

  const totals = useMemo(() => wealthTotals(book?.value ?? null, state.items, state.goalNzd), [book, state]);

  useEffect(() => {
    if (totals.netWorthNzd == null) return;
    setHistory((h) => {
      const next = addHistoryPoint(h, aucklandYmd(), totals.netWorthNzd);
      try {
        window.localStorage.setItem(WEALTH_HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [totals.netWorthNzd]);

  function save(next: WealthState) {
    setState(next);
    try {
      window.localStorage.setItem(WEALTH_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  function add() {
    const v = Number(value.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(v) || v < 0) return;
    const item: WealthItem = { id: `${Date.now()}`, kind, label: label.trim() || KIND_LABEL[kind], valueNzd: Math.round(v * 100) / 100 };
    save({ ...state, items: [...state.items, item] });
    setLabel("");
    setValue("");
  }

  const max = Math.max(1, ...history.map((p) => Math.abs(p.netWorthNzd)));
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-2 py-6 sm:px-4" data-whole-wealth>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Whole wealth</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your paper book plus KiwiSaver, other assets and debts, in NZ$. Items you add here are saved in this browser only.
        </p>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y">
          <tr>
            <td className="py-2">Paper book (portfolio snapshot)</td>
            <td className="tnum py-2 text-right" title={book?.reason ?? undefined}>
              {book == null ? "Loading…" : book.value == null ? `— (${book.reason ?? "not available"})` : formatNzd(book.value)}
            </td>
            <td />
          </tr>
          {state.items.map((it) => (
            <tr key={it.id}>
              <td className="py-2">{it.label} <span className="text-xs text-muted-foreground">· {KIND_LABEL[it.kind]}</span></td>
              <td className="tnum py-2 text-right">{it.kind === "debt" ? `−${formatNzd(it.valueNzd)}` : formatNzd(it.valueNzd)}</td>
              <td className="py-2 text-right">
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => save({ ...state, items: state.items.filter((x) => x.id !== it.id) })}>Remove</button>
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2">Net worth</td>
            <td className="tnum py-2 text-right" data-net-worth>{totals.netWorthNzd == null ? "— (paper book not loaded)" : formatNzd(totals.netWorthNzd)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className="flex flex-wrap items-end gap-2">
        <select aria-label="Kind" className="h-9 rounded-md border bg-background px-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as WealthKind)}>
          {(Object.keys(KIND_LABEL) as WealthKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <input aria-label="Label" placeholder="Label (optional)" className="h-9 rounded-md border bg-background px-2 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input aria-label="Value in NZ$" placeholder="NZ$" inputMode="decimal" className="h-9 w-32 rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="button" onClick={add} className="h-9 rounded-md border px-3 text-sm font-semibold">Add</button>
      </div>
      <div>
        <label className="text-sm font-medium" htmlFor="wealth-goal">Net-worth goal (NZ$)</label>
        <input id="wealth-goal" inputMode="decimal" className="ml-2 h-9 w-36 rounded-md border bg-background px-2 text-sm"
          value={state.goalNzd ?? ""} onChange={(e) => { const v = Number(e.target.value.replace(/[$,\s]/g, "")); save({ ...state, goalNzd: e.target.value.trim() && Number.isFinite(v) ? v : null }); }} />
        <p className="mt-1 text-sm" data-goal-gap>
          {totals.goalGapNzd == null ? "Goal gap: — (set a goal and load the paper book)" : totals.goalGapNzd > 0 ? `Goal gap: ${formatNzd(totals.goalGapNzd)} to go` : `Goal reached, ${formatNzd(-totals.goalGapNzd)} above it`}
        </p>
      </div>
      <section>
        <h2 className="font-semibold">Net worth over time</h2>
        {history.length < 2 ? (
          <p className="text-sm text-muted-foreground">— The chart starts once this page has been opened on two different days. Only values seen on this page are drawn.</p>
        ) : (
          <div className="mt-2 flex h-32 items-end gap-1" role="img" aria-label="Net worth by day">
            {history.map((p) => (
              <div key={p.day} title={`${formatDisplayDate(p.day)}: ${formatNzd(p.netWorthNzd)}`} className="flex-1 rounded-t bg-primary/70" style={{ height: `${(Math.abs(p.netWorthNzd) / max) * 100}%` }} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
