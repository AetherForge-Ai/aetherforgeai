"use client";
import { scrollRegionProps } from "@/lib/focus-trap";
import { holdingsColumnWidth } from "@/lib/holdings-columns";

import { Fragment, useState, type ReactNode } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";

import { FigureReadout } from "@/components/dashboard/ShowTheMaths";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CASH_COLUMN_REASON,
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
import type { ReportRunControl } from "@/lib/report-quota-display";
import { MISSING_MARK } from "@/lib/portfolio-snapshot";
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
  onInspect,
  onReport,
  onAlert,
  onWatch,
  reportRuns,
  actionFor,
  cryptoEmpty,
  emptyActions,
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
  onTrade: (row: HoldingsRowModel, action: "buy" | "sell" | "edit" | "delete" | "dividend") => void;
  onCash: (mode: "deposit" | "withdraw") => void;
  onInspect: (row: HoldingsRowModel) => void;
  onReport: (row: HoldingsRowModel, kind: "stox" | "koins") => void;
  onAlert: (row: HoldingsRowModel) => void;
  onWatch: (row: HoldingsRowModel) => void;
  reportRuns: { stox: ReportRunControl; koins: ReportRunControl };
  actionFor: (row: HoldingsRowModel) => HoldingAction;
  cryptoEmpty?: ReactNode;
  emptyActions?: ReactNode;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columns = model?.columns || COLUMN_SETS.summary;
  // Goal b13 M-6: the desktop table sits in a ~710 px card beside the right rail at
  // every desktop width. Qty and Price fold into the Asset cell ("40 × NZ$40.61"),
  // so Market value, Total return, Weight and Actions always fit without sideways scroll.
  const folded = columns.includes("qty") || columns.includes("price");
  const tableColumns = columns.filter((column) => column !== "qty" && column !== "price");
  let positionCount = 0;
  if (model) {
    for (const group of model.groups) {
      for (const row of group.rows) {
        if (row.kind === "position") positionCount += 1;
      }
    }
  }
  const emptyBook = !!model && positionCount === 0;

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
            className="mt-1 min-h-11 w-full rounded-md border border-border/70 bg-background px-2 py-1.5 text-sm text-foreground md:min-h-9"
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
                "min-h-11 min-w-11 rounded-md border px-2.5 py-1 text-xs font-semibold md:min-h-8 md:min-w-0",
                query.assetClass === id ? "border-primary bg-primary text-primary-foreground" : "border-border/70 text-muted-foreground"
              )}
            >
              {id === "all" ? "All" : id === "shares" ? "Shares" : id === "crypto" ? "Crypto" : id === "metals" ? "Metals" : "Cash"}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="min-h-11 md:min-h-8" disabled={loading} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
          Filters
        </Button>
        <Button type="button" variant="outline" size="sm" className="min-h-11 md:min-h-8" disabled={loading} aria-expanded={columnsOpen} onClick={() => setColumnsOpen((open) => !open)}>
          Columns
        </Button>
        {filtersOpen ? (
        <>
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
        </>
        ) : null}
        {model ? (
          <span className="text-xs font-semibold text-foreground" data-reconciliation={model.reconciliationLabel}>
            {model.reconciliationLabel}
          </span>
        ) : null}
      </div>
      {columnsOpen ? (
        <fieldset className="mt-2 flex flex-wrap gap-2 text-xs">
          <legend className="text-xs font-semibold text-foreground">Columns. Asset stays pinned.</legend>
          {CUSTOM_COLUMN_CHOICES.map((id) => (
            <label key={id} className="inline-flex min-h-11 items-center gap-1 md:min-h-6">
              <input
                type="checkbox"
                checked={columnSet === "custom" ? customColumns.includes(id) : columns.includes(id)}
                onChange={() => {
                  const current = columnSet === "custom" ? customColumns : columns.filter((column) => column !== "asset" && column !== "actions");
                  const next = current.includes(id) ? current.filter((column) => column !== id) : [...current, id];
                  onColumnSet("custom");
                  onCustomColumns(next);
                }}
              />
              {COLUMN_LABEL[id]}
            </label>
          ))}
        </fieldset>
      ) : null}
      {asOfLabel ? <p className="mt-2 text-xs text-muted-foreground">Snapshot {asOfLabel}.</p> : null}
      {emptyBook ? (
        <div className="mt-3 rounded-3xl border border-dashed border-border/70 bg-card/40 p-5" data-empty-book>
          <p className="text-sm font-medium">No holdings yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Shares, crypto and metals show here after your first buy. Cash stays on its own row.</p>
          {emptyActions ? <div className="mt-3 flex flex-wrap gap-2">{emptyActions}</div> : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-3 md:hidden">
        {loading || !model ? (
          <div className="h-24 animate-pulse rounded-2xl bg-muted/40" />
        ) : (
          model.groups.map((group) => {
            const rows = emptyBook ? group.rows.filter((row) => row.kind === "cash") : group.rows;
            if (!rows.length) return null;
            return (
              <section key={group.id} className="space-y-2">
                <h3 className="text-sm font-semibold">{group.label}</h3>
                {rows.map((row) => (
                  <article key={row.id} className="rounded-2xl border border-border/70 bg-card/50 p-3">
                    <AssetCell row={row} onOpen={() => onInspect(row)} />
                    <dl className="mt-3 divide-y divide-border/40 text-sm">
                      {columns.filter((column) => column !== "asset" && column !== "actions").map((column) => (
                        <div key={column} className="flex items-start justify-between gap-4 py-2">
                          <dt className="shrink-0 pt-0.5 text-xs text-muted-foreground">{COLUMN_LABEL[column]}</dt>
                          <dd className="tnum min-w-0 text-right tabular-nums"><CellView cell={row.cells[column]} label={`${row.ticker} ${COLUMN_LABEL[column]}`} signed={SIGNED.has(column)} /></dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
              </section>
            );
          })
        )}
      </div>

      {/* b7 M-6: auto layout so no figure can draw over its neighbour; a narrow
          window scrolls the table sideways instead of overlapping columns. */}
      <div className="mt-3 hidden overflow-x-auto rounded-3xl border border-border/70 bg-card/50 md:block" {...scrollRegionProps("Holdings table")}>
        {loading || !model ? (
          <div className="space-y-3 p-6">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="h-12 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
            ))}
          </div>
        ) : (
          <table className="w-full table-auto border-collapse text-xs">
            <caption className="sr-only">Holdings from the portfolio snapshot{asOfLabel ? `, ${asOfLabel}` : ""}</caption>
            <colgroup>
              {tableColumns.map((column) => (
                // Preferred share only; auto layout never shrinks a column below its content.
                <col key={column} style={{ width: `${holdingsColumnWidth(column, tableColumns)}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                {tableColumns.map((column) => {
                  const active = query.sortKey === column;
                  const sortable = isSortableColumn(column);
                  return (
                    <th
                      key={column}
                      scope="col"
                      aria-sort={sortable ? (active ? (query.sortDir === "asc" ? "ascending" : "descending") : "none") : undefined}
                      className={cn(
                        "px-1.5 py-3 font-medium",
                        column === "asset" ? "w-[24%] text-left" : "text-right",
                        column === "actions" && "w-[3rem]"
                      )}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          className="inline-flex min-h-6 items-center gap-1 font-medium focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
                          onClick={() =>
                            patch({
                              sortKey: column,
                              sortDir: active && query.sortDir === "desc" ? "asc" : "desc",
                            })
                          }
                        >
                          {COLUMN_LABEL[column]}
                          {active ? (
                            <span aria-hidden="true">{query.sortDir === "asc" ? "▲" : "▼"}</span>
                          ) : null}
                          {active ? <span className="sr-only">, sorted {query.sortDir === "asc" ? "ascending" : "descending"}</span> : null}
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
                  <td colSpan={tableColumns.length} className="px-4 py-10 text-center text-muted-foreground">
                    No holdings match these filters.
                  </td>
                </tr>
              ) : (
                model.groups.map((group) => {
                  const rows = emptyBook ? group.rows.filter((row) => row.kind === "cash") : group.rows;
                  if (emptyBook && rows.length === 0) return null;
                  return (
                  <Fragment key={group.id}>
                    <tr className="border-t border-border/60 bg-muted/20">
                      <th scope="rowgroup" colSpan={tableColumns.length} className="px-3 py-2 text-left font-semibold">
                        <span className="inline-flex flex-wrap items-center gap-3">
                          <span>{group.label}</span>
                          <FigureReadout figure={group.subtotal} label={`${group.label} subtotal`} />
                        </span>
                      </th>
                    </tr>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={tableColumns.length} className="px-4 py-4 text-muted-foreground">
                          <span>{group.emptyLabel}</span>
                          {group.id === "crypto" && cryptoEmpty ? <span className="mt-2 block">{cryptoEmpty}</span> : null}
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                          <tr key={row.id} className="border-t border-border/40 align-top">
                            {tableColumns.map((column) => (
                              <td key={column} className={cn("py-3 align-top", column === "asset" ? "px-1.5 text-left" : column === "actions" ? "px-1.5 text-left" : cn("whitespace-nowrap text-right", "px-1 tabular-nums"))}>
                                {column === "asset" ? (
                                  <AssetCell row={row} onOpen={() => onInspect(row)} folded={folded} />
                                ) : column === "actions" ? (
                                  <RowActions
                                    row={row}
                                    resolved={row.kind === "position" ? actionFor(row) : null}
                                    onTrade={onTrade}
                                    onCash={onCash}
                                    onReport={onReport}
                                    onAlert={onAlert}
                                    onWatch={onWatch}
                                    reportRuns={reportRuns}
                                  />
                                ) : (
                                  <CellView cell={row.cells[column]} label={`${row.ticker} ${COLUMN_LABEL[column]}`} signed={SIGNED.has(column)} />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))
                    )}
                  </Fragment>
                  );
                })
              )}
            </tbody>
            {model.groups.length ? (
              <tfoot>
                <tr className="border-t border-border/70">
                  <th scope="row" className="px-3 py-3 text-left">
                    {model.grandLabel}
                  </th>
                  <td colSpan={Math.max(tableColumns.length - 1, 1)} className="px-3 py-3 text-right">
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

const selectClass = "mt-1 min-h-11 md:min-h-9 rounded-md border border-border/70 bg-background px-2 py-1.5 text-sm text-foreground";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function AssetCell({ row, onOpen, folded = false }: { row: HoldingsRowModel; onOpen: () => void; folded?: boolean }) {
  const qty = row.cells.qty?.figures[0]?.display;
  const price = row.cells.price?.figures[0]?.display;
  return (
    <span className="flex items-start gap-2">
      <button
        type="button"
        className="-m-2.5 inline-flex size-11 shrink-0 items-center md:m-0 md:mt-0.5 md:size-6 justify-center rounded-md text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
        aria-label={`Open ${row.name}`}
        onClick={onOpen}
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
      <span className="hidden" aria-hidden>
        {(row.ticker || "?").slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="block max-w-[9rem] truncate font-medium min-[1440px]:max-w-[11rem] min-[1440px]:whitespace-normal min-[1440px]:break-words" title={row.name} data-full-name>{row.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">{row.ticker}</span>
          {row.kind === "cash" ? (
            <Badge variant="secondary">Cash</Badge>
          ) : (
            <>
              {row.exchange && row.exchange !== row.classLabel ? <Badge variant="outline">{row.exchange}</Badge> : null}
              <Badge variant="secondary">{row.classLabel}</Badge>
            </>
          )}
          {row.closed ? <Badge variant="outline">Closed</Badge> : null}
          {row.negativeCash ? <Badge variant="outline">Below zero</Badge> : null}
        </span>
        {folded && row.kind !== "cash" && (qty || price) ? (
          <span className="mt-1 block whitespace-nowrap text-xs tabular-nums text-muted-foreground" data-folded-qty-price>
            <span className="sr-only">Quantity and price: </span>
            {qty || MISSING_MARK} × {price || MISSING_MARK}
          </span>
        ) : null}
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
    <span className="flex w-full min-w-0 flex-col items-end gap-1">
      {/* Goal b12 M-6: amount and percent stack in one cell so the table fits its column. */}
      {/* Goal b13 M-6: amount · percent on one line (nowrap); the Actions column is one ⋯ menu. */}
      <span className="flex flex-row flex-nowrap items-center justify-end gap-x-1 whitespace-nowrap tabular-nums">
        {cell.figures.map((figure, index) => (
          <Fragment key={`${label}-${index}`}>
            {index > 0 ? <span aria-hidden="true" className="text-muted-foreground">·</span> : null}
            <FigureReadout
              figure={figure}
              label={cell.figures.length > 1 ? `${label} ${index === 0 ? "amount" : "percent"}` : label}
              signed={signed && index === 0}
              compact={index > 0}
              showReason={figure.display === MISSING_MARK && figure.reason !== "No previous close was stored for this holding." && figure.reason !== CASH_COLUMN_REASON}
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
  onReport,
  onAlert,
  onWatch,
  reportRuns,
}: {
  row: HoldingsRowModel;
  resolved: HoldingAction | null;
  onTrade: (row: HoldingsRowModel, action: "buy" | "sell" | "edit" | "delete" | "dividend") => void;
  onCash: (mode: "deposit" | "withdraw") => void;
  onReport: (row: HoldingsRowModel, kind: "stox" | "koins") => void;
  onAlert: (row: HoldingsRowModel) => void;
  onWatch: (row: HoldingsRowModel) => void;
  reportRuns: { stox: ReportRunControl; koins: ReportRunControl };
}) {
  if (row.kind === "cash") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="size-11 text-foreground opacity-100 md:size-8" aria-label="Actions for Cash" data-cash-actions>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onCash("deposit")}>Deposit</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCash("withdraw")}>Withdraw</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  if (!resolved || resolved.ok === false) {
    const reason = resolved && resolved.ok === false ? resolved.reason : "This row is not on the holdings list.";
    return (
      <span className="block max-w-full text-xs text-muted-foreground" title={reason}>
        {MISSING_MARK}
        <span className="mt-1 block">{reason}</span>
      </span>
    );
  }
  const nothingOpen = row.closed || (row.position?.quantity || 0) <= 1e-9;
  const metal = row.assetClass === "metals";
  const reportKind = row.assetClass === "crypto" ? "koins" : row.assetClass === "shares" ? "stox" : null;
  return (
    <span className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="size-11 md:size-8" aria-label={`Actions for ${row.ticker || row.name}`} data-row-actions>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onTrade(row, "buy")}>Buy</DropdownMenuItem>
          <DropdownMenuItem disabled={nothingOpen} title={nothingOpen ? "Nothing open to sell." : undefined} onSelect={() => onTrade(row, "sell")}>
            Sell
          </DropdownMenuItem>
          {reportKind ? (
            <DropdownMenuItem
              disabled={reportRuns[reportKind].disabled}
              title={reportRuns[reportKind].title}
              onSelect={() => onReport(row, reportKind)}
            >
              {reportRuns[reportKind].label}
            </DropdownMenuItem>
          ) : null}
          {metal ? null : (
            <DropdownMenuItem onSelect={() => onTrade(row, "dividend")}>Dividend</DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => onTrade(row, "edit")}>Edit</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onTrade(row, "delete")}>Delete</DropdownMenuItem>
          {metal ? null : (
            <>
              <DropdownMenuItem onSelect={() => onAlert(row)}>Set alert</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onWatch(row)}>Add to watchlist</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

