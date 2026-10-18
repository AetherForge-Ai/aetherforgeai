"use client";

import { useMemo, useRef, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isTradeLine, tradeDeleteCopy, type TradeEditFields } from "@/lib/ledger-row-edit";
import { formatLedgerQtyPrice } from "@/lib/ledger-line-format";
import { MISSING_MARK, pageLedger, type PortfolioSnapshot, type SnapshotLedgerLine } from "@/lib/portfolio-snapshot";

const PAGE_SIZES = [25, 50, 100] as const;

export function TransactionsTab({
  snapshot: snapshotProp,
  loading: loadingProp,
  error = null,
  onRetry,
  onRecord,
  onEdit,
  onDeleteDividend,
  onEditTrade,
}: {
  snapshot: PortfolioSnapshot | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRecord: () => void;
  onEdit: (line: SnapshotLedgerLine) => void;
  /** Removes one dividend, buy or sell (the server refuses an oversell). */
  onDeleteDividend: (line: SnapshotLedgerLine) => Promise<boolean | void> | boolean | void;
  /** BL-7: edit one buy or sell. Resolves true when saved. */
  onEditTrade?: (line: SnapshotLedgerLine, fields: TradeEditFields) => Promise<boolean>;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [showAll, setShowAll] = useState(false);
  const [pending, setPending] = useState<SnapshotLedgerLine | null>(null);
  const [busy, setBusy] = useState(false);
  // b7 H-5: rows removed in this session leave the list at once, before the
  // refreshed snapshot arrives, so a stale row can't be deleted twice.
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set());
  // Goal b18 G-10: never blank the list while the book refetches. The last book
  // shown stays on screen until a new one arrives.
  const lastSnapshotRef = useRef<PortfolioSnapshot | null>(null);
  // b30 G-10: a delete in flight must not flash an empty list. A book that arrives with
  // fewer rows than (shown − deletes in flight) while a delete is pending is an
  // intermediate read; the last book stays until the reconciled one arrives.
  const deletesInFlight = useRef(0);
  if (snapshotProp) {
    const prevRows = lastSnapshotRef.current?.ledger?.length ?? 0;
    const nextRows = snapshotProp.ledger?.length ?? 0;
    const transient = deletesInFlight.current > 0 && nextRows < prevRows - deletesInFlight.current;
    if (!transient) lastSnapshotRef.current = snapshotProp;
  }
  const snapshot = lastSnapshotRef.current ?? snapshotProp;
  const loading = loadingProp && !snapshot;
  const [editing, setEditing] = useState<SnapshotLedgerLine | null>(null);
  const [draft, setDraft] = useState({ quantity: "", price: "", fees: "" });

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const line of snapshot?.ledger || []) set.add(line.type);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [snapshot]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (snapshot?.ledger || []).filter((line) => {
      if (removedIds.has(line.id)) return false;
      if (type !== "all" && line.type !== type) return false;
      if (!query) return true;
      return `${line.ticker} ${line.type}`.toLowerCase().includes(query);
    });
  }, [snapshot, q, type, removedIds]);

  const paged = pageLedger(filtered, { page, pageSize, showAll });
  const effect = pending ? dividendDeleteEffect(snapshot?.kpis.cash.value ?? null, pending.cashNzd, pending.type) : null;

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
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card/50 md:overflow-x-clip">
        {error && !snapshot ? null : loading || !snapshot ? (
          <div className="space-y-3 p-6">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-10 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
            ))}
          </div>
        ) : (
          <table className="w-full min-w-[36rem] border-collapse text-sm md:min-w-0 md:table-fixed">
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
                <th scope="col" className="w-[5.75rem] px-2 py-3 text-right font-medium">Actions</th>
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
                    <td className="px-2 py-3 text-right">
                      <span className="flex flex-col items-stretch gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={`Edit ${line.type} ${line.ticker}`}
                          onClick={() => {
                            if (onEditTrade && isTradeLine(line)) {
                              setDraft({ quantity: String(line.quantity ?? ""), price: String(line.price ?? ""), fees: "" });
                              setEditing(line);
                            } else onEdit(line);
                          }}
                        >
                          Edit
                        </Button>
                        {line.type === "dividend" || line.type === "deposit" || line.type === "withdraw" || line.type === "withdrawal" || (onEditTrade && isTradeLine(line)) ? (
                          <Button type="button" size="sm" variant="outline" aria-label={`Delete ${line.type} ${line.ticker}`} onClick={() => setPending(line)}>
                            Delete
                          </Button>
                        ) : (
                          <Button type="button" size="sm" variant="outline" disabled title="This row cannot be removed from this list. Opening balances and holding edits are changed from Cash or the holding instead.">
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
            <AlertDialogTitle>{pending ? `Remove this ${pending.type}?` : "Remove this row?"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {pending && isTradeLine(pending) ? (
                  <p>{tradeDeleteCopy(pending)}</p>
                ) : (
                  <>
                    <p>Cash before {effect?.cashBefore}. Cash impact {effect?.lineImpact}. Cash after {effect?.cashAfter}.</p>
                    <p>{effect?.reason}</p>
                    <p>Cancel changes nothing.</p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !pending}
              onClick={(event) => {
                event.preventDefault();
                if (!pending || busy) return;
                const target = pending;
                // b29 G-10: optimistic. The row leaves and the dialog closes at once (the open modal
                // hid the whole ledger from TT's row count for 3–4 s); a refusal brings it back.
                setRemovedIds((prev) => new Set(prev).add(target.id));
                setPending(null);
                deletesInFlight.current += 1;
                void Promise.resolve(onDeleteDividend(target)).finally(() => {
                  deletesInFlight.current = Math.max(0, deletesInFlight.current - 1);
                }).then((ok) => {
                  if (ok === false)
                    setRemovedIds((prev) => {
                      const next = new Set(prev);
                      next.delete(target.id);
                      return next;
                    });
                });
              }}
            >
              {busy ? "Removing…" : pending ? `Remove ${pending.type === "withdraw" ? "withdrawal" : pending.type}` : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={editing != null} onOpenChange={(open) => !open && !busy && setEditing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{editing ? `Edit this ${editing.type} of ${editing.ticker}?` : "Edit trade"}</AlertDialogTitle>
            <AlertDialogDescription>
              Cash, the holding and FIFO gains are worked out again from the edited row. A change that leaves a later sell
              with more units than you hold is refused. Leave fees blank to keep them. Cancel changes nothing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["quantity", "price", "fees"] as const).map((field) => (
              <div key={field} className="space-y-1">
                <Label htmlFor={`trade-edit-${field}`} className="capitalize">{field}</Label>
                <Input
                  id={`trade-edit-${field}`}
                  inputMode="decimal"
                  value={draft[field]}
                  onChange={(event) => setDraft((d) => ({ ...d, [field]: event.target.value }))}
                />
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || !editing}
              onClick={(event) => {
                event.preventDefault();
                if (!editing || !onEditTrade) return;
                setBusy(true);
                const fields: TradeEditFields = {
                  quantity: draft.quantity === "" ? undefined : Number(draft.quantity),
                  price: draft.price === "" ? undefined : Number(draft.price),
                  fees: draft.fees === "" ? undefined : Number(draft.fees),
                };
                void onEditTrade(editing, fields)
                  .then((saved) => {
                    if (saved) setEditing(null);
                  })
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "Saving…" : "Save change"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
