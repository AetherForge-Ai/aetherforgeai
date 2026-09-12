"use client";

import { useCallback, useMemo, useState } from "react";
import type { HoldingMetrics } from "@/lib/portfolio";
import { formatNumber, formatPercent } from "@/lib/portfolio";
import { formatMoney, CURRENCY_META, type CurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  LineChart,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";

export type HoldingSortKey =
  | "ticker"
  | "date"
  | "company"
  | "shares"
  | "purchase_price"
  | "current_price"
  | "marketValue"
  | "weight"
  | "gain";

function formatHoldingDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

function exchangeForTicker(ticker: string, assetType?: string | null): string {
  if (assetType === "crypto") return "Crypto";
  if (assetType === "metal") return "Metals";
  const t = ticker.toUpperCase();
  if (t.endsWith(".NZ")) return "NZX";
  if (t.endsWith(".AX")) return "ASX";
  if (t.endsWith(".L")) return "LSE";
  return "US";
}

type ChartTarget = {
  ticker: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: CurrencyCode;
  purchasePrice: number;
  currentPrice: number;
};

type Props = {
  title: string;
  emptyLabel: string;
  emptyHint: string;
  holdings: HoldingMetrics[];
  baseCurrency: CurrencyCode;
  loading?: boolean;
  onAdd?: () => void;
  onEdit: (h: HoldingMetrics) => void;
  onDelete: (h: HoldingMetrics) => void;
  onOpenChart: (target: ChartTarget) => void;
};

/**
 * Compact owned-positions table for Stock / Crypto overview sections —
 * so members can see exactly where the money sits under the KPI windows.
 */
export function HoldingsOwnedTable({
  title,
  emptyLabel,
  emptyHint,
  holdings,
  baseCurrency,
  loading,
  onAdd,
  onEdit,
  onDelete,
  onOpenChart,
}: Props) {
  const [holdingSort, setHoldingSort] = useState<{ key: HoldingSortKey; dir: "asc" | "desc" }>({
    key: "weight",
    dir: "desc",
  });

  const toggleHoldingSort = useCallback((key: HoldingSortKey) => {
    setHoldingSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "ticker" || key === "company" ? "asc" : "desc" },
    );
  }, []);

  const sorted = useMemo(() => {
    const { key, dir } = holdingSort;
    const mult = dir === "asc" ? 1 : -1;
    const val = (h: HoldingMetrics): number | string => {
      switch (key) {
        case "ticker":
          return h.ticker;
        case "date":
          return h.purchase_date || "";
        case "company":
          return h.company_name || h.sector || "";
        case "shares":
          return h.shares;
        case "purchase_price":
          return h.purchase_price;
        case "current_price":
          return h.current_price;
        case "marketValue":
          return h.marketValue;
        case "weight":
          return h.weight;
        case "gain":
          return h.gain;
        default:
          return 0;
      }
    };
    return [...holdings].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * mult;
      }
      return ((av as number) - (bv as number)) * mult;
    });
  }, [holdings, holdingSort]);

  function HoldingHead({
    label,
    k,
    align = "right",
  }: {
    label: string;
    k: HoldingSortKey;
    align?: "left" | "right";
  }) {
    return (
      <button
        type="button"
        onClick={() => toggleHoldingSort(k)}
        className={cn(
          "inline-flex items-center gap-1 font-medium transition-colors",
          align === "right" ? "justify-end" : "justify-start",
          holdingSort.key === k ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {holdingSort.key === k ? (
          holdingSort.dir === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    );
  }

  return (
    <div className="mt-6 rounded-3xl border border-border/70 bg-card/50">
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
        <h3 className="font-display text-base font-bold">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {holdings.length} position{holdings.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <div className="space-y-3 p-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      ) : holdings.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Wallet className="size-6" />
          </span>
          <p className="mt-3 font-medium">{emptyLabel}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{emptyHint}</p>
          {onAdd ? (
            <Button onClick={onAdd} className="mt-4 font-semibold" size="sm">
              <Plus className="mr-2 size-4" /> Add holding
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-6 py-3">
                  <HoldingHead label="Ticker" k="ticker" align="left" />
                </th>
                <th className="px-3 py-3">
                  <HoldingHead label="Purchase date" k="date" align="left" />
                </th>
                <th className="px-3 py-3">
                  <HoldingHead label="Name" k="company" align="left" />
                </th>
                <th className="px-3 py-3 font-medium">Exchange</th>
                <th className="px-3 py-3">
                  <HoldingHead label="Qty" k="shares" />
                </th>
                <th className="px-3 py-3">
                  <HoldingHead label="Price paid" k="purchase_price" />
                </th>
                <th className="px-3 py-3">
                  <HoldingHead label="Current price" k="current_price" />
                </th>
                <th className="px-3 py-3">
                  <HoldingHead label="Market value" k="marketValue" />
                </th>
                <th className="px-3 py-3">
                  <HoldingHead label="% of book" k="weight" />
                </th>
                <th className="px-3 py-3">
                  <HoldingHead label="Gain / Loss" k="gain" />
                </th>
                <th className="px-6 py-3 text-right font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((h) => {
                const up = h.gain >= 0;
                const exchange = exchangeForTicker(h.ticker, h.asset_type);
                return (
                  <tr
                    key={h._id}
                    className="border-b border-border/40 transition-colors last:border-0 hover:bg-background/40"
                  >
                    <td className="px-6 py-3.5">
                      <button
                        type="button"
                        onClick={() =>
                          onOpenChart({
                            ticker: h.ticker,
                            symbol: h.ticker.replace(/\.(NZ|AX|L)$/, ""),
                            name: h.company_name || h.sector || h.ticker,
                            exchange,
                            currency: h.currency,
                            purchasePrice: h.purchase_price,
                            currentPrice: h.current_price,
                          })
                        }
                        className="group/tk flex items-center gap-3 rounded-lg text-left transition-colors hover:text-primary"
                        title={`View last 7 days of ${h.ticker.replace(/\.(NZ|AX|L)$/, "")}`}
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 font-display text-xs font-bold text-primary transition-colors group-hover/tk:bg-primary/20">
                          {h.ticker.replace(/\.(NZ|AX|L)$/, "").slice(0, 4)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold underline-offset-4 group-hover/tk:underline">
                            {h.ticker.replace(/\.(NZ|AX|L)$/, "")}
                          </p>
                          <LineChart className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/tk:opacity-100" />
                          <span
                            className="rounded bg-muted/60 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground"
                            title={CURRENCY_META[h.currency as keyof typeof CURRENCY_META]?.label || h.currency}
                          >
                            {h.currency}
                          </span>
                        </div>
                      </button>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="tnum whitespace-nowrap text-sm text-muted-foreground">
                        {formatHoldingDate(h.purchase_date)}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="max-w-[16rem] truncate text-muted-foreground">
                        {h.company_name || h.sector || "—"}
                      </p>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
                        {exchange}
                      </span>
                    </td>
                    <td className="tnum px-3 py-3.5 text-right text-muted-foreground">
                      {formatNumber(h.shares)}
                    </td>
                    <td className="tnum px-3 py-3.5 text-right text-muted-foreground">
                      {formatMoney(h.purchase_price, h.currency)}
                    </td>
                    <td className="tnum px-3 py-3.5 text-right">
                      {formatMoney(h.current_price, h.currency)}
                    </td>
                    <td className="tnum px-3 py-3.5 text-right font-medium">
                      {formatMoney(h.marketValue, h.currency)}
                      {h.currency !== baseCurrency && (
                        <span className="block text-[0.68rem] font-normal text-muted-foreground">
                          ≈ {formatMoney(h.baseValue, baseCurrency)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="tnum font-medium">{h.weight.toFixed(1)}%</span>
                        <span className="h-1 w-16 overflow-hidden rounded-full bg-muted/50">
                          <span
                            className="block h-full rounded-full bg-primary/70"
                            style={{ width: `${Math.min(100, Math.max(2, h.weight))}%` }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <span className={cn("tnum font-medium", up ? "text-emerald-600" : "text-rose-600")}>
                        {formatMoney(h.gain, h.currency)}
                      </span>
                      <span
                        className={cn("tnum ml-1 block text-xs", up ? "text-emerald-600/80" : "text-rose-600/80")}
                      >
                        {formatPercent(h.gainPct)}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEdit(h)}
                          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                          aria-label={`Edit ${h.ticker}`}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => onDelete(h)}
                          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                          aria-label={`Delete ${h.ticker}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
