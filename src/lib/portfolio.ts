/**
 * Portfolio domain types + pure calculation helpers.
 * Safe to import on client and server (no server-only deps).
 */

import {
  currencyForTicker,
  convertCurrency,
  BASELINE_FX_TO_NZD,
  type CurrencyCode,
  type FxRatesToNZD,
} from "@/lib/currency";

export interface Stock {
  _id: string;
  ticker: string;
  asset_type?: "stock" | "crypto";
  company_name?: string;
  sector?: string;
  shares: number;
  purchase_price: number;
  current_price: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface HoldingMetrics extends Stock {
  currency: CurrencyCode; // native currency of this holding (NZD/AUD/USD)
  costBasis: number; // shares * purchase_price, in NATIVE currency
  marketValue: number; // shares * current_price, in NATIVE currency
  gain: number; // marketValue - costBasis, in NATIVE currency
  gainPct: number; // gain / costBasis * 100
  baseValue: number; // market value converted into the portfolio base currency
  weight: number; // % of total portfolio value (base-currency weighted)
}

export interface PortfolioSummary {
  holdings: HoldingMetrics[];
  baseCurrency: CurrencyCode; // currency all totals are expressed in
  totalValue: number; // in base currency
  totalCost: number; // in base currency
  totalGain: number; // in base currency
  totalGainPct: number;
  bestPerformer: HoldingMetrics | null;
  worstPerformer: HoldingMetrics | null;
  sectorAllocation: { sector: string; value: number; weight: number }[]; // value in base currency
  holdingsCount: number;
}

export interface SummaryOptions {
  /** Currency all totals are aggregated into (NZD for Stox, USD for Koins). */
  baseCurrency?: CurrencyCode;
  /** Live FX rates (1 unit → NZD). Defaults to the baseline table. */
  fxToNZD?: FxRatesToNZD;
}

export function computeSummary(stocks: Stock[], opts: SummaryOptions = {}): PortfolioSummary {
  const baseCurrency = opts.baseCurrency ?? "USD";
  const fx = opts.fxToNZD ?? BASELINE_FX_TO_NZD;

  const enriched = stocks.map((s) => {
    const shares = Number(s.shares) || 0;
    const purchase = Number(s.purchase_price) || 0;
    const current = Number(s.current_price) || purchase;
    const currency = currencyForTicker(s.ticker, s.asset_type === "crypto" ? "crypto" : "stock");
    const costBasis = shares * purchase; // native
    const marketValue = shares * current; // native
    const gain = marketValue - costBasis;
    const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    return {
      ...s,
      current_price: current,
      currency,
      costBasis,
      marketValue,
      gain,
      gainPct,
      baseValue: convertCurrency(marketValue, currency, baseCurrency, fx),
      weight: 0,
    } as HoldingMetrics;
  });

  // Totals in base currency (native values converted per-holding).
  const totalValue = enriched.reduce((sum, h) => sum + h.baseValue, 0);
  const totalCost = enriched.reduce(
    (sum, h) => sum + convertCurrency(h.costBasis, h.currency, baseCurrency, fx),
    0
  );
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  enriched.forEach((h) => {
    h.weight = totalValue > 0 ? (h.baseValue / totalValue) * 100 : 0;
  });

  const sorted = [...enriched].sort((a, b) => b.gainPct - a.gainPct);
  const bestPerformer = sorted.length > 0 ? sorted[0] : null;
  const worstPerformer = sorted.length > 0 ? sorted[sorted.length - 1] : null;

  const sectorMap: Record<string, number> = {};
  enriched.forEach((h) => {
    const sector = h.sector || "Other";
    sectorMap[sector] = (sectorMap[sector] || 0) + h.baseValue;
  });
  const sectorAllocation = Object.entries(sectorMap)
    .map(([sector, value]) => ({
      sector,
      value,
      weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    holdings: enriched,
    baseCurrency,
    totalValue,
    totalCost,
    totalGain,
    totalGainPct,
    bestPerformer,
    worstPerformer,
    sectorAllocation,
    holdingsCount: enriched.length,
  };
}

export function formatCurrency(value: number, opts?: { compact?: boolean }): string {
  if (!isFinite(value)) value = 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: opts?.compact ? "compact" : "standard",
    minimumFractionDigits: opts?.compact ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  if (!isFinite(value)) value = 0;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number): string {
  if (!isFinite(value)) value = 0;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}
