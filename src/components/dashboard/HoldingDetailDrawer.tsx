"use client";

import { Fragment, useState, type ReactNode } from "react";

import { FigureReadout } from "@/components/dashboard/ShowTheMaths";
import { useRestoreScroll } from "@/components/dashboard/use-restore-scroll";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatNzd } from "@/lib/currency";
import type { HoldingsRowModel } from "@/lib/holdings-table";
import { MISSING_MARK, pageLedger } from "@/lib/portfolio-snapshot";

export function HoldingDetailDrawer({
  row,
  onOpenChange,
  actions,
}: {
  row: HoldingsRowModel | null;
  onOpenChange: (open: boolean) => void;
  actions: ReactNode;
}) {
  const [page, setPage] = useState(1);
  const open = row != null;
  const cash = row?.kind === "cash";
  useRestoreScroll(open);
  const paged = row ? pageLedger(row.ledger, { page, pageSize: 10 }) : null;
  const position = row?.position;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        {row ? (
          <div className="space-y-6 px-5 py-6">
            <SheetHeader className="p-0">
              <SheetTitle>{row.name}</SheetTitle>
              <SheetDescription>
                {cash ? `${row.ticker} · Cash balance` : `${row.ticker} · ${row.exchange} · ${row.classLabel}`}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-wrap gap-2">{actions}</div>

            {cash ? null : (
            <section>
              <h3 className="text-sm font-semibold">Open lots</h3>
              {position && position.lots.length ? (
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th scope="col" className="py-1 pr-2">Date</th>
                      <th scope="col" className="py-1 pr-2">Qty</th>
                      <th scope="col" className="py-1 pr-2">Price</th>
                      <th scope="col" className="py-1 pr-2">FX</th>
                      <th scope="col" className="py-1">Cost NZD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {position.lots.map((lot) => (
                      <tr key={`${lot.acquired}-${lot.quantity}-${lot.priceLocal}`}>
                        <td className="py-1 pr-2">{lot.acquiredLabel}</td>
                        <td className="tnum py-1 pr-2">{lot.quantity}</td>
                        <td className="tnum py-1 pr-2">{lot.priceLocal}</td>
                        <td className="tnum py-1 pr-2">{lot.fxDisplay}</td>
                        <td className="tnum py-1">
                          {lot.costNzd == null ? (
                            <span>
                              {MISSING_MARK}
                              <span className="sr-only"> Cost in NZ$ was not stored for this lot.</span>
                            </span>
                          ) : (
                            formatNzd(lot.costNzd)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {row.kind === "cash" ? "Cash is a balance, not a lot." : "No open lots"}
                </p>
              )}
            </section>
            )}

            <section>
              <h3 className="text-sm font-semibold">{cash ? "Cash movements" : "Transactions"}</h3>
              {paged && paged.rows.length ? (
                <>
                  <table className="mt-2 w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th scope="col" className="py-1 pr-2">Type</th>
                        <th scope="col" className="py-1 pr-2">Qty × price</th>
                        <th scope="col" className="py-1 pr-2">FX</th>
                        <th scope="col" className="py-1 pr-2">Cash</th>
                        <th scope="col" className="py-1">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.rows.map((line) => (
                        <tr key={line.id}>
                          <td className="py-1 pr-2">{line.type}</td>
                          <td className="tnum py-1 pr-2">
                            {line.quantity == null ? MISSING_MARK : line.quantity} × {line.price == null ? MISSING_MARK : line.price}
                          </td>
                          <td className="tnum py-1 pr-2">{line.fxDisplay}</td>
                          <td className="tnum py-1 pr-2">{formatNzd(line.cashNzd)}</td>
                          <td className="py-1">{line.whenLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{paged.label}</span>
                    <Button type="button" size="sm" variant="outline" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>
                      Previous
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={paged.page >= paged.pageCount} onClick={() => setPage(paged.page + 1)}>
                      Next
                    </Button>
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {cash ? "No deposits, withdrawals, or trade settlements are stored for this balance." : "No transactions are stored on this row."}
                </p>
              )}
            </section>

            {cash ? null : (
            <section>
              <h3 className="text-sm font-semibold">Income</h3>
              {position ? (
                <ul className="mt-2 space-y-1 text-xs">
                  <li className="flex justify-between gap-2">
                    <span>Gross</span>
                    <FigureReadout figure={position.incomeGross} label="Gross income" />
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>Withholding</span>
                    <FigureReadout figure={position.incomeWithholding} label="Withholding" />
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>Net</span>
                    <FigureReadout figure={position.income} label="Net income" />
                  </li>
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No dividend is stored on cash.</p>
              )}
              {row.dividends.length ? (
                <ul className="mt-2 text-xs text-muted-foreground">
                  {row.dividends.map((line) => (
                    <li key={line.id}>
                      {line.type} · {line.whenLabel} · {formatNzd(line.cashNzd)} · FX {line.fxDisplay}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
            )}

            {cash ? null : (
            <section className="space-y-3 text-xs">
              <div>
                <h3 className="text-sm font-semibold">Price history</h3>
                <p className="mt-1 text-muted-foreground">
                  {MISSING_MARK} No 30-day price history was stored.
                </p>
                <p className="mt-1 text-muted-foreground">
                  {position?.priceSource || MISSING_MARK}
                  {position?.priceSource ? "" : " No price source was stored."} · {position?.priceAsOf || "No quote time was stored."}
                </p>
              </div>
              {position ? (
                <div>
                  <h3 className="text-sm font-semibold">Return split</h3>
                  <ul className="mt-2 space-y-1">
                    {(
                      [
                        ["Price part", position.unrealisedPrice, "Row price part"],
                        ["Realised price", position.realisedPrice, "Row realised price"],
                        ["Income", position.income, "Row income"],
                        ["Currency", position.currencyEffect, "Row currency"],
                        ["Fees", position.fees, "Row fees"],
                        ["Total return", position.totalReturn, "Row total return"],
                      ] as const
                    ).map(([label, figure, maths]) => (
                      <li key={label} className="flex justify-between gap-2">
                        <span>{label}</span>
                        <FigureReadout figure={figure} label={maths} signed />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-muted-foreground">
                {MISSING_MARK} No price alert is stored on this snapshot.
              </p>
            </section>
            )}
          </div>
        ) : (
          <Fragment />
        )}
      </SheetContent>
    </Sheet>
  );
}
