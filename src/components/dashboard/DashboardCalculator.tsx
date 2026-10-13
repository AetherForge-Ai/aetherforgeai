"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { HoldingDetailDrawer } from "@/components/dashboard/HoldingDetailDrawer";
import { IncomeTaxPanel } from "@/components/dashboard/IncomeTaxPanel";
import { KpiHeader } from "@/components/dashboard/KpiHeader";
import { TransactionsTab } from "@/components/dashboard/TransactionsTab";
import { UnifiedHoldingsTable } from "@/components/dashboard/UnifiedHoldingsTable";
import { Button } from "@/components/ui/button";
import { DASHBOARD_TABS, DASHBOARD_TAB_LABEL, readDashboardTab, writeDashboardTab, type DashboardTab } from "@/lib/dashboard-tabs";
import {
  annualisedAvailability,
  kpiView,
  periodSpanDays,
  readHeaderState,
  writeHeaderState,
  type BenchmarkId,
  type PercentMode,
  type PeriodId,
} from "@/lib/dashboard-kpi";
import {
  columnsFor,
  CUSTOM_COLUMN_CHOICES,
  DEFAULT_HOLDINGS_QUERY,
  buildHoldingsTable,
  isColumnSetId,
  readHoldingsQuery,
  writeHoldingsQuery,
  type ColumnId,
  type ColumnSetId,
  type HoldingsQuery,
  type HoldingsRowModel,
} from "@/lib/holdings-table";
import type { HoldingAction } from "@/lib/holding-action";
import type { ReportRunControl } from "@/lib/report-quota-display";
import type { PortfolioSnapshot, SnapshotClass, SnapshotLedgerLine } from "@/lib/portfolio-snapshot";

/**
 * KPI header and unified holdings table.
 * Every money figure is a field on the portfolio snapshot passed in.
 */
export function DashboardCalculator({
  snapshot,
  loading,
  error,
  userId,
  onTrade,
  onCash,
  onRecord,
  onEditLedger,
  onDeleteDividend,
  onReport,
  onAlert,
  onWatch,
  reportRuns,
  actionFor,
  actions,
  rail,
  insights,
  reports,
  cryptoEmpty,
  emptyActions,
  onRetry,
}: {
  snapshot: PortfolioSnapshot | null;
  loading: boolean;
  error: string | null;
  userId: string | null;
  onTrade: (input: {
    ticker: string;
    name: string;
    assetClass: SnapshotClass;
    action: "buy" | "sell" | "edit" | "delete" | "dividend";
    target: { via: "stock"; stockId: string } | { via: "metal-store"; metalId: string };
  }) => void;
  onCash: (mode: "deposit" | "withdraw") => void;
  onRecord: () => void;
  onEditLedger: (line: SnapshotLedgerLine) => void;
  onDeleteDividend: (line: SnapshotLedgerLine) => Promise<void> | void;
  onReport: (row: HoldingsRowModel, kind: "stox" | "koins") => void;
  onAlert: (row: HoldingsRowModel) => void;
  onWatch: (row: HoldingsRowModel) => void;
  reportRuns: { stox: ReportRunControl; koins: ReportRunControl };
  actionFor: (input: { ticker: string; assetClass: SnapshotClass; holdingId: string | null }) => HoldingAction;
  actions?: ReactNode;
  rail?: ReactNode;
  insights?: ReactNode;
  reports?: ReactNode;
  cryptoEmpty?: ReactNode;
  emptyActions?: ReactNode;
  onRetry?: () => void;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState<HoldingsQuery>(DEFAULT_HOLDINGS_QUERY);
  const [columnSet, setColumnSet] = useState<ColumnSetId>("summary");
  const [customColumns, setCustomColumns] = useState<ColumnId[]>([...CUSTOM_COLUMN_CHOICES]);
  const [period, setPeriod] = useState<PeriodId>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [percentMode, setPercentMode] = useState<PercentMode>("simple");
  const [benchmarkId, setBenchmarkId] = useState<BenchmarkId>("nzx50");
  const [tab, setTab] = useState<DashboardTab>("holdings");
  const [detail, setDetail] = useState<HoldingsRowModel | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const header = readHeaderState(params);
    const storedQuery = readHoldingsQuery(params);
    const stored = readStoredColumns(userId);
    setPeriod(header.period);
    setCustomFrom(header.from);
    setCustomTo(header.to);
    setPercentMode(header.percentMode);
    setBenchmarkId(header.benchmarkId);
    setTab(readDashboardTab(params));
    setQuery({
      q: storedQuery.q,
      assetClass: storedQuery.assetClass,
      market: storedQuery.market,
      currency: storedQuery.currency,
      gain: storedQuery.gain,
      open: storedQuery.open,
      groupBy: storedQuery.groupBy,
      sortKey: storedQuery.sortKey,
      sortDir: storedQuery.sortDir,
    });
    if (!params.get("hcols") && stored) {
      setColumnSet(stored.set);
      if (stored.columns.length) setCustomColumns(stored.columns);
    } else {
      setColumnSet(storedQuery.columnSet);
      if (storedQuery.customColumns.length) setCustomColumns(storedQuery.customColumns);
    }
    setHydrated(true);
    performance.mark("dashboard-tabs-interactive");
  }, [userId]);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    const landed = window.location.hash === "#dashboard-tabs" || params.has("tab");
    if (!landed) return;
    const frame = window.requestAnimationFrame(() => {
      const el = tabsRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fullyVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (!fullyVisible) el.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    writeHeaderState(params, { period, from: customFrom, to: customTo, percentMode, benchmarkId });
    writeDashboardTab(params, tab);
    writeHoldingsQuery(params, query, columnSet, customColumns);
    const next = params.toString();
    const current = window.location.search.replace(/^\?/, "");
    if (next !== current) {
      const hash = window.location.hash;
      window.history.replaceState(null, "", next ? `${window.location.pathname}?${next}${hash}` : `${window.location.pathname}${hash}`);
    }
    writeStoredColumns(userId, columnSet, customColumns);
  }, [hydrated, query, columnSet, customColumns, period, customFrom, customTo, percentMode, benchmarkId, userId, tab]);

  useEffect(() => {
    function onPop() {
      const params = new URLSearchParams(window.location.search);
      const header = readHeaderState(params);
      const storedQuery = readHoldingsQuery(params);
      setPeriod(header.period);
      setCustomFrom(header.from);
      setCustomTo(header.to);
      setPercentMode(header.percentMode);
      setBenchmarkId(header.benchmarkId);
      setTab(readDashboardTab(params));
      setQuery({
        q: storedQuery.q,
        assetClass: storedQuery.assetClass,
        market: storedQuery.market,
        currency: storedQuery.currency,
        gain: storedQuery.gain,
        open: storedQuery.open,
        groupBy: storedQuery.groupBy,
        sortKey: storedQuery.sortKey,
        sortDir: storedQuery.sortDir,
      });
      setColumnSet(storedQuery.columnSet);
      if (storedQuery.customColumns.length) setCustomColumns(storedQuery.customColumns);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const columns = useMemo(() => columnsFor(columnSet, customColumns), [columnSet, customColumns]);
  const table = useMemo(
    () => (snapshot ? buildHoldingsTable(snapshot, query, columns, period) : null),
    [snapshot, query, columns, period]
  );
  const spanDays = snapshot ? periodSpanDays(period, snapshot.asOf, { from: customFrom, to: customTo }) : null;
  const annualised = snapshot
    ? annualisedAvailability(snapshot, period, spanDays)
    : { enabled: false, reason: "Per year is shown only when the period is 90 days or longer." };
  const view = snapshot
    ? kpiView(snapshot, {
        period,
        percentMode: percentMode === "annualised" && annualised.enabled ? "annualised" : "simple",
        benchmarkId,
        spanDays,
        annualisedEnabled: annualised.enabled,
        filteredNote: table?.filteredNote,
      })
    : null;

  function chooseColumnSet(next: ColumnSetId) {
    if (!isColumnSetId(next)) return;
    setColumnSet(next);
    if (next === "custom" && customColumns.length === 0) setCustomColumns([...CUSTOM_COLUMN_CHOICES]);
  }

  const pending = !snapshot && (loading || !error);
  const detailAction = detail && detail.kind === "position" ? actionFor(detail) : null;

  function tradeFrom(row: HoldingsRowModel, action: "buy" | "sell" | "edit" | "delete" | "dividend") {
    const resolved = actionFor(row);
    if (!resolved.ok) return;
    onTrade({
      ticker: row.ticker,
      name: row.name,
      assetClass: row.assetClass,
      action,
      target: resolved.via === "stock" ? { via: "stock", stockId: resolved.stockId } : { via: "metal-store", metalId: resolved.metalId },
    });
  }

  const showRail = tab === "holdings" && !!rail;

  return (
    <div data-calculator="portfolio" data-section="dashboard-workspace">
      {error && !snapshot && tab !== "transactions" ? <p className="mt-4 text-sm text-muted-foreground">{error}</p> : null}
      <div className="flex flex-col">
        <div
          id="dashboard-tabs"
          ref={tabsRef}
          data-tti="dashboard-tabs"
          className="order-1 mt-4 flex scroll-mt-24 flex-nowrap gap-1 overflow-x-auto border-b border-border/70 md:order-3"
          role="tablist"
          aria-label="Dashboard"
        >
          {DASHBOARD_TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={
                tab === id
                  ? "shrink-0 whitespace-nowrap border-b-2 border-primary px-3 py-2 text-sm font-semibold text-foreground"
                  : "shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium text-muted-foreground"
              }
              onClick={() => setTab(id)}
            >
              {DASHBOARD_TAB_LABEL[id]}
            </button>
          ))}
        </div>
        {actions ? <div className="order-3 md:order-1">{actions}</div> : null}
        <div className="order-2 md:order-2">
      <KpiHeader
        view={pending ? null : view}
        loading={pending}
        asOfLabel={snapshot?.asOfLabel || null}
        period={period}
        onPeriod={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustom={(from, to) => {
          setCustomFrom(from);
          setCustomTo(to);
        }}
        percentMode={percentMode === "annualised" && annualised.enabled ? "annualised" : "simple"}
        annualisedEnabled={annualised.enabled}
        annualisedReason={annualised.reason}
        onPercentMode={setPercentMode}
        benchmarkId={benchmarkId}
        onBenchmark={setBenchmarkId}
        cashLines={snapshot?.cashLines || []}
        cashWarning={snapshot?.cashWarning || null}
      />
        </div>
      </div>
      <div className={showRail ? "mt-4 grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]" : "mt-4 min-w-0"}>
        <div className="min-w-0">
          {tab === "holdings" ? (
            <UnifiedHoldingsTable
              model={pending ? null : table}
              loading={pending}
              asOfLabel={snapshot?.asOfLabel || null}
              query={query}
              columnSet={columnSet}
              customColumns={customColumns}
              onQuery={setQuery}
              onColumnSet={chooseColumnSet}
              onCustomColumns={setCustomColumns}
              onTrade={tradeFrom}
              onCash={onCash}
              onInspect={setDetail}
              onReport={onReport}
              onAlert={onAlert}
              onWatch={onWatch}
              reportRuns={reportRuns}
              actionFor={actionFor}
              cryptoEmpty={cryptoEmpty}
              emptyActions={emptyActions}
            />
          ) : null}
          {tab === "transactions" ? (
            <TransactionsTab
              snapshot={pending ? null : snapshot}
              loading={pending}
              error={error}
              onRetry={onRetry}
              onRecord={onRecord}
              onEdit={onEditLedger}
              onDeleteDividend={onDeleteDividend}
            />
          ) : null}
          {tab === "income" ? <IncomeTaxPanel snapshot={pending ? null : snapshot} loading={pending} /> : null}
          {tab === "insights" ? insights : null}
          {reports ? <div className="mt-6 min-w-0">{reports}</div> : null}
        </div>
        {showRail ? <aside className="space-y-4">{rail}</aside> : null}
      </div>
      <HoldingDetailDrawer
        row={detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        actions={
          detail ? (
            <DetailActions
              row={detail}
              resolved={detailAction}
              onTrade={tradeFrom}
              onCash={onCash}
              onReport={onReport}
              onAlert={onAlert}
              onWatch={onWatch}
              reportRuns={reportRuns}
            />
          ) : null
        }
      />
    </div>
  );
}

function DetailActions({
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
      <>
        <Button type="button" size="sm" variant="outline" onClick={() => onCash("deposit")}>Deposit</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onCash("withdraw")}>Withdraw</Button>
        <Button type="button" size="sm" variant="outline" disabled title="FX convert is not on this table yet.">Convert</Button>
      </>
    );
  }
  if (!resolved || resolved.ok === false) {
    const reason = resolved && resolved.ok === false ? resolved.reason : "This row is not on the holdings list.";
    return <p className="text-xs text-muted-foreground">{reason}</p>;
  }
  const metal = row.assetClass === "metals";
  const reportKind = row.assetClass === "crypto" ? "koins" : row.assetClass === "shares" ? "stox" : null;
  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-11 min-h-11 px-4" onClick={() => onTrade(row, "buy")}>Buy</Button>
      <Button type="button" size="sm" variant="outline" className="h-11 min-h-11 px-4" onClick={() => onTrade(row, "sell")}>Sell</Button>
      {metal ? null : <Button type="button" size="sm" variant="outline" className="h-11 min-h-11 px-4" onClick={() => onTrade(row, "dividend")}>Dividend</Button>}
      <Button type="button" size="sm" variant="outline" className="h-11 min-h-11 px-4" onClick={() => onTrade(row, "edit")}>Edit</Button>
      <Button type="button" size="sm" variant="outline" onClick={() => onTrade(row, "delete")}>Delete</Button>
      {reportKind ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-11 min-h-11 max-w-full whitespace-normal px-4"
          disabled={reportRuns[reportKind].disabled}
          title={reportRuns[reportKind].title}
          onClick={() => onReport(row, reportKind)}
        >
          {reportRuns[reportKind].label}
        </Button>
      ) : null}
      {metal ? null : (
        <>
          <Button type="button" size="sm" variant="outline" onClick={() => onAlert(row)}>Set alert</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onWatch(row)}>Add to watchlist</Button>
        </>
      )}
    </>
  );
}

function storageKey(userId: string | null): string {
  return `aetherforge.holdings-columns.${userId || "account"}`;
}

function readStoredColumns(userId: string | null): { set: ColumnSetId; columns: ColumnId[] } | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { set?: string; columns?: string[] };
    if (!isColumnSetId(parsed.set)) return null;
    const columns = (parsed.columns || []).filter((id): id is ColumnId => id in COLUMN_LABEL_GUARD);
    return { set: parsed.set, columns };
  } catch {
    return null;
  }
}

function writeStoredColumns(userId: string | null, set: ColumnSetId, columns: readonly ColumnId[]): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify({ set, columns }));
  } catch {
    /* The column choice still works for this visit. */
  }
}

const COLUMN_LABEL_GUARD: Record<string, true> = Object.fromEntries(CUSTOM_COLUMN_CHOICES.map((id) => [id, true]));
