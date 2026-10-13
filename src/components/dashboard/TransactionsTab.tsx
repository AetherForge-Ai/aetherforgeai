"use client";

import { useMemo, useState } from "react";

import { FigureReadout } from "@/components/dashboard/ShowTheMaths";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { dividendDeleteEffect } from "@/lib/dashboard-tabs";
import { formatNzd } from "@/lib/currency";
import { formatLedgerQtyPrice } from "@/lib/ledger-line-format";
import { MISSING_MARK, pageLedger, type PortfolioSnapshot, type SnapshotLedgerLine } from "@/lib/portfolio-snapshot";

const PAGE_SIZES = [25, 50, 100] as const;

export function TransactionsTab({
  snapshot,
  loading,
  error = null,
  onRetry,
  onRecord,
  onEdit,
  onDeleteDividend,
}: {
  snapshot: PortfolioSnapshot | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRecord: () => void;
  onEdit: (line: SnapshotLedgerLine) => void;
  onDeleteDividend: (line: SnapshotLedgerLine) => Promise<void> | void;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [showAll, setShowAll] = useState(false);
  const [pending, setPending] = useState<SnapshotLedgerLine | null>(null);
  const [busy, setBusy] = useState(false);

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const line of snapshot?.ledger || []) set.add(line.type);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [snapshot]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (snapshot?.ledger || []).filter((line) => {
      if (type !== "all" && line.type !== type) return false;
      if (!query) return true;
      return `${line.ticker} ${line.type}`.toLowerCase().includes(query);
    });
  }, [snapshot, q, type]);

  const paged = pageLedger(filtered, { page, pageSize, showAll });
  const effect = pending ? dividendDeleteEffect(snapshot?.kpis.cash.value ?? null, pending.cashNzd) : null;

  return (
    <section className="space-y-4" data-section="transactions-tab" aria-busy={loading || undefined}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Transactions</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            One ledger. Cost method is FIFO.
          </p>
        </div>
        <Button type="button" onClick={onRecord}>
          Record a transaction
        </Button>
      </div>
      {snapshot ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
            <p className="text-xs font-medium text-muted-foreground">Cash</p>
            <FigureReadout figure={snapshot.kpis.cash} label="Cash" showReason className="mt-1 items-start" />
            {snapshot.cashWarning ? <p className="mt-1 text-xs text-muted-foreground">{snapshot.cashWarning}</p> : null}
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/50 p-4">
            <p className="text-xs font-medium text-muted-foreground">Realised</p>
            <FigureReadout figure={snapshot.kpis.realised} label="Realised" signed showReason className="mt-1 items-start" />
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-xs text-muted-foreground">
          Search
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            aria-label="Search transactions"
            placeholder="Ticker or type"
            className="mt-1 w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Type
          <select
            aria-label="Transaction type"
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
            className="mt-1 rounded-md border border-border/70 bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="all">All</option>
            {types.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Page size
          <select
            aria-label="Page size"
            value={showAll ? "all" : String(pageSize)}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "all") {
                setShowAll(true);
                return;
              }
              setShowAll(false);
              setPageSize(Number(next) as (typeof PAGE_SIZES)[number]);
              setPage(1);
            }}
            className="mt-1 rounded-md border border-border/70 bg-background px-2 py-1.5 text-sm text-foreground"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
            <option value="all">Show all</option>
          </select>
        </label>
      </div>
      {error && !snapshot ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-5">
          <p className="text-sm font-medium">The ledger did not load.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          {onRetry ? (
            <Button type="button" className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card/50">
        {error && !snapshot ? null : loading || !snapshot ? (
          <div className="space-y-3 p-6">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-10 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
            ))}
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">Ledger from the portfolio snapshot</caption>
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-3 py-3 font-medium">Type</th>
                <th scope="col" className="px-3 py-3 font-medium">Asset</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Qty × Price</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Fees</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">FX</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Cash impact</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Realised</th>
                <th scope="col" className="w-[7.5rem] whitespace-nowrap px-3 py-3 text-right font-medium">Date</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                    No transactions match these filters.
                  </td>
                </tr>
              ) : (
                paged.rows.map((line) => {
                  const qtyPrice = formatLedgerQtyPrice(line);
                  return (
                  <tr key={line.id} className="border-t border-border/40">
                    <td className="px-3 py-3 capitalize">{line.type}</td>
                    <td className="px-3 py-3">{line.ticker || "Cash"}</td>
                    <td className="tnum px-3 py-3 text-right" title={qtyPrice.reason || undefined}>
                      {qtyPrice.text}
                      {qtyPrice.reason ? <span className="sr-only"> {qtyPrice.reason}</span> : null}
                    </td>
                    <td className="tnum px-3 py-3 text-right">{line.feesNzd == null ? MISSING_MARK : formatNzd(line.feesNzd)}</td>
                    <td className="tnum px-3 py-3 text-right">{line.fxDisplay}</td>
                    <td className="tnum px-3 py-3 text-right">{formatNzd(line.cashNzd)}</td>
                    <td className="tnum px-3 py-3 text-right">{line.realisedNzd == null ? MISSING_MARK : formatNzd(line.realisedNzd)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">{line.whenLabel}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="inline-flex justify-end gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => onEdit(line)}>
                          Edit
                        </Button>
                        {line.type === "dividend" ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => setPending(line)}>
                            Delete
                          </Button>
                        ) : (
                          <Button type="button" size="sm" variant="outline" disabled title="Only a dividend can be removed from this list.">
                            Delete
                          </Button>
                        )}
                      </span>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
      {snapshot ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{paged.label}</span>
          <Button type="button" size="sm" variant="outline" disabled={showAll || paged.page <= 1} onClick={() => setPage(paged.page - 1)}>
            Previous
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={showAll || paged.page >= paged.pageCount} onClick={() => setPage(paged.page + 1)}>
            Next
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setShowAll((current) => !current);
              setPage(1);
            }}
          >
            {showAll ? "Show pages" : "Show all"}
          </Button>
        </p>
      ) : null}

      <AlertDialog open={pending != null} onOpenChange={(open) => !open && !busy && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this dividend?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Cash before {effect?.cashBefore}. Cash impact {effect?.lineImpact}. Cash after {effect?.cashAfter}.</p>
                <p>{effect?.reason}</p>
                <p>Cancel changes nothing.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !pending}
              onClick={(event) => {
                event.preventDefault();
                if (!pending) return;
                setBusy(true);
                void Promise.resolve(onDeleteDividend(pending)).finally(() => {
                  setBusy(false);
                  setPending(null);
                });
              }}
            >
              {busy ? "Removing…" : "Remove dividend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
