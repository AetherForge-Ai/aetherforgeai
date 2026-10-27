"use client";
import { RAIL_ASIDE_CLASS, RAIL_GRID_CLASS } from "@/lib/dashboard-rail";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { KpiHeader } from "@/components/dashboard/KpiHeader";

// DASH-CLEAN C (perf): tab panels and the detail drawer load on first use, not with the Holdings view.
// The fallback reserves height so switching tabs does not shift the page.
const tabFallback = () => <div className="mt-4 h-64 animate-pulse rounded-2xl bg-muted/40 motion-reduce:animate-none" aria-hidden />;
const TransactionsTab = dynamic(() => import("@/components/dashboard/TransactionsTab").then((m) => m.TransactionsTab), { loading: tabFallback });
const IncomeTaxPanel = dynamic(() => import("@/components/dashboard/IncomeTaxPanel").then((m) => m.IncomeTaxPanel), { loading: tabFallback });
const HoldingDetailDrawer = dynamic(() => import("@/components/dashboard/HoldingDetailDrawer").then((m) => m.HoldingDetailDrawer));
import { TabEmptyState, isEmptyBook } from "@/components/dashboard/TabEmptyState";
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
  onEditTrade,
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
  onDeleteDividend: (line: SnapshotLedgerLine) => Promise<boolean | void> | boolean | void;
  onEditTrade?: (line: SnapshotLedgerLine, fields: import("@/lib/ledger-row-edit").TradeEditFields) => Promise<boolean>;
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
  const [tabEdges, setTabEdges] = useState({ left: false, right: false });
  // DASH-CLEAN-D: keep the chosen tab whole in view and refresh the edge fades.
  useEffect(() => {
    const strip = tabsRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>('[aria-selected="true"]');
    if (active) {
      // Scroll to a whole-tab boundary, so the tab at the left edge is never half shown.
      const starts = [...strip.querySelectorAll<HTMLElement>("[role=tab]")].map((el) => el.offsetLeft - strip.offsetLeft - 4);
      const need = active.offsetLeft - strip.offsetLeft + active.offsetWidth + 24 - strip.clientWidth;
      const activeStart = active.offsetLeft - strip.offsetLeft - 4;
      if (strip.scrollLeft > activeStart) strip.scrollLeft = Math.max(0, activeStart);
      else if (strip.scrollLeft < need) strip.scrollLeft = Math.max(0, starts.find((x) => x >= need) ?? activeStart);
    }
    const update = () => setTabEdges(tabEdgeState(strip));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [tab]);

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
        {/* DASH-CLEAN-D: phones show the tabs as a 2x2 grid so no label is cut; wider screens snap to a whole label and fade at a scrollable edge. */}
        <div className="relative order-1 mt-4 md:order-3" data-tab-strip>
        <div
          id="dashboard-tabs"
          ref={tabsRef}
          data-tti="dashboard-tabs"
          onScroll={(event) => setTabEdges(tabEdgeState(event.currentTarget))}
          className="grid scroll-mt-24 grid-cols-2 gap-x-1 border-b border-border/70 sm:flex sm:snap-x sm:snap-mandatory sm:scroll-px-2 sm:flex-nowrap sm:gap-1 sm:overflow-x-auto sm:px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  ? "min-h-11 shrink-0 snap-start whitespace-nowrap border-b-2 border-primary px-2 py-2 text-sm font-semibold text-foreground sm:px-3"
                  : "min-h-11 shrink-0 snap-start whitespace-nowrap border-b-2 border-transparent px-2 py-2 text-sm font-medium text-muted-foreground sm:border-b-0 sm:px-3"
              }
              onClick={() => setTab(id)}
            >
              {DASHBOARD_TAB_LABEL[id]}
            </button>
          ))}
        </div>
        {tabEdges.left ? <span aria-hidden data-tab-fade="left" className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-card to-transparent" /> : null}
        {tabEdges.right ? <span aria-hidden data-tab-fade="right" className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-card to-transparent" /> : null}
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
      <div className={showRail ? RAIL_GRID_CLASS : "mt-4 min-w-0"}>
        <div className="min-w-0">
          {tab === "holdings" ? <h2 className="mb-3 font-display text-lg font-bold">Holdings</h2> : null}
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
          {tab !== "holdings" && !pending && isEmptyBook(snapshot) ? (
            <TabEmptyState tab={tab} action={emptyActions} />
          ) : null}
          {tab === "transactions" && !(!pending && isEmptyBook(snapshot)) ? (
            <TransactionsTab
              snapshot={pending ? null : snapshot}
              loading={pending}
              error={error}
              onRetry={onRetry}
              onRecord={onRecord}
              onEdit={onEditLedger}
              onDeleteDividend={onDeleteDividend}
              onEditTrade={onEditTrade}
            />
          ) : null}
          {tab === "income" && !(!pending && isEmptyBook(snapshot)) ? <IncomeTaxPanel snapshot={pending ? null : snapshot} loading={pending} /> : null}
          {tab === "insights" && !(!pending && isEmptyBook(snapshot)) ? insights : null}
          {reports ? <div className="mt-6 min-w-0">{reports}</div> : null}
        </div>
        {showRail ? (
          // D6/D7: sticky on xl with its own scroll, clear of the 4rem header and the Guide chip.
          // D7 (1024–1279): a two-column card grid under the summary, above the holdings.
          <aside
            aria-label="Dashboard tools"
            data-dashboard-rail
            className={RAIL_ASIDE_CLASS}
          >
            {rail}
          </aside>
        ) : null}
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
        <Button type="button" size="sm" variant="outline" className="min-h-11 md:min-h-8" onClick={() => onCash("deposit")}>Deposit</Button>
        <Button type="button" size="sm" variant="outline" className="min-h-11 md:min-h-8" onClick={() => onCash("withdraw")}>Withdraw</Button>
        <Button type="button" size="sm" variant="outline" className="min-h-11 md:min-h-8" disabled title="FX convert is not on this table yet.">Convert</Button>
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
      <Button type="button" size="sm" variant="outline" className="min-h-11 md:min-h-8" onClick={() => onTrade(row, "delete")}>Delete</Button>
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
          <Button type="button" size="sm" variant="outline" className="min-h-11 md:min-h-8" onClick={() => onAlert(row)}>Set alert</Button>
          <Button type="button" size="sm" variant="outline" className="min-h-11 md:min-h-8" onClick={() => onWatch(row)}>Add to watchlist</Button>
        </>
      )}
    </>
  );
}

function tabEdgeState(el: HTMLElement): { left: boolean; right: boolean } {
  return { left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 };
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
