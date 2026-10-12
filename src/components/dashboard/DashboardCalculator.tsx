"use client";

import { useEffect, useMemo, useState } from "react";

import { KpiHeader } from "@/components/dashboard/KpiHeader";
import { UnifiedHoldingsTable } from "@/components/dashboard/UnifiedHoldingsTable";
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
} from "@/lib/holdings-table";
import type { PortfolioSnapshot, SnapshotClass } from "@/lib/portfolio-snapshot";

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
}: {
  snapshot: PortfolioSnapshot | null;
  loading: boolean;
  error: string | null;
  userId: string | null;
  onTrade: (input: { ticker: string; name: string; assetClass: SnapshotClass; action: "buy" | "sell" | "edit" | "delete" }) => void;
  onCash: (mode: "deposit" | "withdraw") => void;
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
  }, [userId]);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    writeHeaderState(params, { period, from: customFrom, to: customTo, percentMode, benchmarkId });
    writeHoldingsQuery(params, query, columnSet, customColumns);
    const next = params.toString();
    const current = window.location.search.replace(/^\?/, "");
    if (next !== current) {
      const hash = window.location.hash;
      window.history.replaceState(null, "", next ? `${window.location.pathname}?${next}${hash}` : `${window.location.pathname}${hash}`);
    }
    writeStoredColumns(userId, columnSet, customColumns);
  }, [hydrated, query, columnSet, customColumns, period, customFrom, customTo, percentMode, benchmarkId, userId]);

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
  return (
    <div data-calculator="portfolio">
      {error && !snapshot ? <p className="mt-4 text-sm text-muted-foreground">{error}</p> : null}
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
        onTrade={(row, action) =>
          onTrade({ ticker: row.ticker, name: row.name, assetClass: row.assetClass, action })
        }
        onCash={onCash}
      />
    </div>
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
