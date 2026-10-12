"use client";

import { Fragment, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { FigureReadout } from "@/components/dashboard/ShowTheMaths";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNzd } from "@/lib/currency";
import {
  COLUMN_LABEL,
  COLUMN_SETS,
  CUSTOM_COLUMN_CHOICES,
  isSortableColumn,
  type ColumnId,
  type ColumnSetId,
  type GroupBy,
  type HoldingsQuery,
  type HoldingsRowModel,
  type HoldingsTableModel,
  type OpenFilter,
  type TableCellModel,
} from "@/lib/holdings-table";
import type { HoldingAction } from "@/lib/holding-action";
import { MISSING_MARK, pageLedger } from "@/lib/portfolio-snapshot";
import { cn } from "@/lib/utils";

const SIGNED: ReadonlySet<ColumnId> = new Set([
  "unrealised",
  "realised",
  "income",
  "currency",
  "fees",
  "totalReturn",
  "day",
  "week",
  "month",
  "ytd",
  "periodReturn",
  "annualised",
  "incomeGross",
  "withholding",
  "incomeNet",
]);

export function UnifiedHoldingsTable({
  model,
  loading,
  asOfLabel,
  query,
  columnSet,
  customColumns,
  onQuery,
  onColumnSet,
  onCustomColumns,
  onTrade,
  onCash,
  actionFor,
}: {
  model: HoldingsTableModel | null;
  loading: boolean;
  asOfLabel: string | null;
  query: HoldingsQuery;
  columnSet: ColumnSetId;
  customColumns: ColumnId[];
  onQuery: (query: HoldingsQuery) => void;
  onColumnSet: (set: ColumnSetId) => void;
  onCustomColumns: (columns: ColumnId[]) => void;
  onTrade: (row: HoldingsRowModel, action: "buy" | "sell" | "edit" | "delete") => void;
  onCash: (mode: "deposit" | "withdraw") => void;
  actionFor: (row: HoldingsRowModel) => HoldingAction;
}) {
  const columns = model?.columns || COLUMN_SETS.summary;
  const [openId, setOpenId] = useState<string | null>(null);
  const [pages, setPages] = useState<Record<string, number>>({});

  function patch(partial: Partial<HoldingsQuery>) {
    onQuery({ ...query, ...partial });
  }

  return (
    <section className="mt-4" aria-busy={loading || undefined} data-section="holdings-table">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-xs text-muted-foreground">
          Search
          <input
            value={query.q}
            onChange={(event) => patch({ q: event.target.value })}
            placeholder="Name or ticker"
            aria-label="Search holdings"
            disabled={loading}
            className="mt-1 w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <div className="inline-flex flex-wrap gap-1" role="group" aria-label="Asset class">
          {(["all", "shares", "crypto", "metals", "cash"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={query.assetClass === id}
              disabled={loading}
              onClick={() => patch({ assetClass: id })}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-semibold",
                query.assetClass === id ? "border-primary bg-primary text-primary-foreground" : "border-border/70 text-muted-foreground"
              )}
            >
              {id === "all" ? "All" : id === "shares" ? "Shares" : id === "crypto" ? "Crypto" : id === "metals" ? "Metals" : "Cash"}
            </button>
          ))}
        </div>
        <Field label="Market">
          <select aria-label="Market" value={query.market} disabled={loading} onChange={(event) => patch({ market: event.target.value })} className={selectClass}>
            <option value="">All</option>
            {(model?.markets || []).map((market) => (
              <option key={market} value={market}>
                {market}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Currency">
          <select aria-label="Currency" value={query.currency} disabled={loading} onChange={(event) => patch({ currency: event.target.value })} className={selectClass}>
            <option value="">All</option>
            {(model?.currencies || []).map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Gain or loss">
          <select
            aria-label="Gain or loss"
            value={query.gain}
            disabled={loading}
            onChange={(event) => patch({ gain: event.target.value as HoldingsQuery["gain"] })}
            className={selectClass}
          >
            <option value="all">All</option>
            <option value="gain">Gain</option>
            <option value="loss">Loss</option>
          </select>
        </Field>
        <Field label="Open">
          <select
            aria-label="Open or closed"
            value={query.open}
            disabled={loading}
            onChange={(event) => patch({ open: event.target.value as OpenFilter })}
            className={selectClass}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </Field>
        <Field label="Group">
          <select
            aria-label="Group by"
            value={query.groupBy}
            disabled={loading}
            onChange={(event) => patch({ groupBy: event.target.value as GroupBy })}
            className={selectClass}
          >
            <option value="class">Asset class</option>
            <option value="market">Market</option>
            <option value="currency">Currency</option>
            <option value="broker">Broker</option>
            <option value="sector">Sector</option>
            <option value="none">None</option>
          </select>
        </Field>
        <Field label="Columns">
          <select
            aria-label="Columns"
            value={columnSet}
            disabled={loading}
            onChange={(event) => onColumnSet(event.target.value as ColumnSetId)}
            className={selectClass}
          >
            <option value="summary">Summary</option>
            <option value="performance">Performance</option>
            <option value="income">Income</option>
            <option value="tax">Tax</option>
            <option value="crypto">Crypto</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
        {model ? (
          <span className="text-xs font-semibold text-foreground" data-reconciliation={model.reconciliationLabel}>
            {model.reconciliationLabel}
          </span>
        ) : null}
      </div>
      {columnSet === "custom" ? (
        <fieldset className="mt-2 flex flex-wrap gap-2 text-xs">
          <legend className="sr-only">Custom columns</legend>
          {CUSTOM_COLUMN_CHOICES.map((id) => (
            <label key={id} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={customColumns.includes(id)}
                onChange={() => {
                  const next = customColumns.includes(id) ? customColumns.filter((column) => column !== id) : [...customColumns, id];
                  onCustomColumns(next);
                }}
              />
              {COLUMN_LABEL[id]}
            </label>
          ))}
        </fieldset>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        {asOfLabel ? `Snapshot ${asOfLabel}. ` : ""}
        Prices show the source on the badge. A dash has its reason on the info button. A dash is not a zero.
      </p>

      <div className="mt-3 overflow-x-auto rounded-3xl border border-border/70 bg-card/50">
        {loading || !model ? (
          <div className="space-y-3 p-6">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="h-12 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
            ))}
          </div>
        ) : (
          <table className="w-full min-w-[64rem] border-collapse text-sm">
            <caption className="sr-only">Holdings from the portfolio snapshot{asOfLabel ? `, ${asOfLabel}` : ""}</caption>
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                {columns.map((column) => {
                  const active = query.sortKey === column;
                  const sortable = isSortableColumn(column);
                  return (
                    <th
                      key={column}
                      scope="col"
                      aria-sort={sortable ? (active ? (query.sortDir === "asc" ? "ascending" : "descending") : "none") : undefined}
                      className={cn("px-3 py-3 font-medium", column === "asset" ? "text-left" : "text-right")}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-medium focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
                          onClick={() =>
                            patch({
                              sortKey: column,
                              sortDir: active && query.sortDir === "desc" ? "asc" : "desc",
                            })
                          }
                        >
                          {COLUMN_LABEL[column]}
                        </button>
                      ) : (
                        COLUMN_LABEL[column]
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {model.groups.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
                    No holdings match these filters.
                  </td>
                </tr>
              ) : (
                model.groups.map((group) => (
                  <Fragment key={group.id}>
                    <tr className="border-t border-border/60 bg-muted/20">
                      <th scope="rowgroup" colSpan={columns.length} className="px-3 py-2 text-left font-semibold">
                        <span className="inline-flex flex-wrap items-center gap-3">
                          <span>{group.label}</span>
                          <FigureReadout figure={group.subtotal} label={`${group.label} subtotal`} />
                        </span>
                      </th>
                    </tr>
                    {group.rows.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length} className="px-4 py-4 text-muted-foreground">
                          {group.emptyLabel}
                        </td>
                      </tr>
                    ) : (
                      group.rows.map((row) => {
                        const expanded = openId === row.id;
                        const page = pageLedger(row.ledger, { page: pages[row.id] || 1, pageSize: 10 });
                        return (
                          <Fragment key={row.id}>
                            <tr className="border-t border-border/40 align-top">
                              {columns.map((column) => (
                                <td key={column} className={cn("px-3 py-3", column === "asset" || column === "actions" ? "text-left" : "text-right")}>
                                  {column === "asset" ? (
                                    <AssetCell row={row} expanded={expanded} onToggle={() => setOpenId(expanded ? null : row.id)} />
                                  ) : column === "actions" ? (
                                    <RowActions
                                      row={row}
                                      resolved={row.kind === "position" ? actionFor(row) : null}
                                      onTrade={onTrade}
                                      onCash={onCash}
                                    />
                                  ) : (
                                    <CellView cell={row.cells[column]} label={`${row.ticker} ${COLUMN_LABEL[column]}`} signed={SIGNED.has(column)} />
                                  )}
                                </td>
                              ))}
                            </tr>
                            {expanded ? (
                              <tr className="border-t border-border/40">
                                <td colSpan={columns.length} className="bg-background/40 px-4 py-4">
                                  <RowExpansion
                                    row={row}
                                    pageLabel={page.label}
                                    pageRows={page.rows}
                                    page={page.page}
                                    pageCount={page.pageCount}
                                    onPage={(next) => setPages((current) => ({ ...current, [row.id]: next }))}
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
            {model.groups.length ? (
              <tfoot>
                <tr className="border-t border-border/70">
                  <th scope="row" className="px-3 py-3 text-left">
                    {model.grandLabel}
                  </th>
                  <td colSpan={Math.max(columns.length - 1, 1)} className="px-3 py-3 text-right">
                    <FigureReadout figure={model.grand} label={model.grandLabel} showReason />
                    {model.matchesFullBook ? (
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">Same net worth as the header.</span>
                    ) : model.filteredNote ? (
                      <span className="mt-1 block text-xs font-normal text-muted-foreground">Visible rows. The header stays the full book.</span>
                    ) : null}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        )}
      </div>
    </section>
  );
}

const selectClass = "mt-1 rounded-md border border-border/70 bg-background px-2 py-1.5 text-sm text-foreground";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function AssetCell({ row, expanded, onToggle }: { row: HoldingsRowModel; expanded: boolean; onToggle: () => void }) {
  return (
    <span className="flex items-start gap-2">
      <button
        type="button"
        className="mt-0.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${row.name}`}
        onClick={onToggle}
      >
        <ChevronRight className={cn("size-4 transition-transform motion-reduce:transition-none", expanded && "rotate-90")} aria-hidden />
      </button>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-xs font-semibold text-primary" aria-hidden>
        {(row.ticker || "?").slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{row.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">{row.ticker}</span>
          <Badge variant="outline">{row.exchange}</Badge>
          <Badge variant="secondary">{row.classLabel}</Badge>
          {row.closed ? <Badge variant="outline">Closed</Badge> : null}
          {row.negativeCash ? <Badge variant="outline">Below zero</Badge> : null}
        </span>
      </span>
    </span>
  );
}

function CellView({ cell, label, signed }: { cell: TableCellModel | undefined; label: string; signed: boolean }) {
  if (!cell || !cell.figures.length) {
    return (
      <span title="This column was not on the snapshot.">
        {MISSING_MARK}
        <span className="sr-only"> This column was not on the snapshot.</span>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex flex-wrap items-center justify-end gap-1">
        {cell.figures.map((figure, index) => (
          <Fragment key={`${label}-${index}`}>
            {index > 0 ? <span aria-hidden>/</span> : null}
            <FigureReadout
              figure={figure}
              label={cell.figures.length > 1 ? `${label} ${index === 0 ? "amount" : "percent"}` : label}
              signed={signed && index === 0}
              showReason={figure.display === MISSING_MARK}
            />
          </Fragment>
        ))}
      </span>
      {cell.badge ? (
        <Badge variant="outline" title={cell.badge.reason || undefined}>
          {cell.badge.label}
          {cell.badge.reason ? <span className="sr-only"> {cell.badge.reason}</span> : null}
        </Badge>
      ) : null}
    </span>
  );
}

function RowActions({
  row,
  resolved,
  onTrade,
  onCash,
}: {
  row: HoldingsRowModel;
  resolved: HoldingAction | null;
  onTrade: (row: HoldingsRowModel, action: "buy" | "sell" | "edit" | "delete") => void;
  onCash: (mode: "deposit" | "withdraw") => void;
}) {
  if (row.kind === "cash") {
    return (
      <span className="flex flex-wrap gap-1">
        <Button type="button" size="sm" variant="outline" onClick={() => onCash("deposit")}>
          Deposit
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onCash("withdraw")}>
          Withdraw
        </Button>
        <Button type="button" size="sm" variant="outline" disabled title="FX convert is not on this table yet.">
          Convert
        </Button>
      </span>
    );
  }
  if (!resolved || resolved.ok === false) {
    const reason = resolved && resolved.ok === false ? resolved.reason : "This row is not on the holdings list.";
    return (
      <span className="block max-w-[16rem] text-xs text-muted-foreground" title={reason}>
        {MISSING_MARK}
        <span className="mt-1 block">{reason}</span>
      </span>
    );
  }
  const nothingOpen = row.closed || (row.position?.quantity || 0) <= 1e-9;
  const metalStore = resolved.via === "metal-store";
  return (
    <span className="flex flex-wrap gap-1">
      <Button type="button" size="sm" variant="outline" onClick={() => onTrade(row, "buy")}>
        Buy
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={nothingOpen} title={nothingOpen ? "Nothing open to sell." : undefined} onClick={() => onTrade(row, "sell")}>
        Sell
      </Button>
      {metalStore ? null : (
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => onTrade(row, "edit")}>
            Edit
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onTrade(row, "delete")}>
            Delete
          </Button>
        </>
      )}
    </span>
  );
}

function RowExpansion({
  row,
  pageLabel,
  pageRows,
  page,
  pageCount,
  onPage,
}: {
  row: HoldingsRowModel;
  pageLabel: string;
  pageRows: HoldingsRowModel["ledger"];
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  const position = row.position;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
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
          <p className="mt-2 text-xs text-muted-foreground">No open lots</p>
        )}
        {position ? (
          <div className="mt-3 space-y-1 text-xs">
            <p>Unrealised price and exchange-rate parts are on the row.</p>
            <p className="flex justify-between gap-2">
              <span>Price part</span>
              <FigureReadout figure={position.unrealisedPrice} label="Unrealised price part" signed />
            </p>
            <p className="flex justify-between gap-2">
              <span>Currency part</span>
              <FigureReadout figure={position.unrealisedFx} label="Unrealised currency part" signed />
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Cash is a balance, not a lot.</p>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold">Transactions</h3>
        {pageRows.length ? (
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
                {pageRows.map((line) => (
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
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{pageLabel}</span>
              <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
                Previous
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
                Next
              </Button>
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">No transactions are stored on this row.</p>
        )}
      </div>
      <div>
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
      </div>
      <div className="space-y-3 text-xs">
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
              <li className="flex justify-between gap-2">
                <span>Price part</span>
                <FigureReadout figure={position.unrealisedPrice} label="Row price part" signed />
              </li>
              <li className="flex justify-between gap-2">
                <span>Realised price</span>
                <FigureReadout figure={position.realisedPrice} label="Row realised price" signed />
              </li>
              <li className="flex justify-between gap-2">
                <span>Income</span>
                <FigureReadout figure={position.income} label="Row income" signed />
              </li>
              <li className="flex justify-between gap-2">
                <span>Currency</span>
                <FigureReadout figure={position.currencyEffect} label="Row currency" signed />
              </li>
              <li className="flex justify-between gap-2">
                <span>Fees</span>
                <FigureReadout figure={position.fees} label="Row fees" signed />
              </li>
              <li className="flex justify-between gap-2 font-medium">
                <span>Total return</span>
                <FigureReadout figure={position.totalReturn} label="Row total return" signed />
              </li>
            </ul>
          </div>
        ) : null}
        <p className="text-muted-foreground">
          {MISSING_MARK} No price alert is stored on this snapshot.
        </p>
      </div>
    </div>
  );
}
