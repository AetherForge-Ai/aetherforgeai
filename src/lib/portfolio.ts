/**
 * Portfolio domain types + pure calculation helpers.
 * Safe to import on client and server (no server-only deps).
 */

export interface Stock {
  _id: string;
  ticker: string;
  company_name?: string;
  sector?: string;
  shares: number;
  purchase_price: number;
  current_price: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface HoldingMetrics extends Stock {
  costBasis: number; // shares * purchase_price
  marketValue: number; // shares * current_price
  gain: number; // marketValue - costBasis
  gainPct: number; // gain / costBasis * 100
  weight: number; // % of total portfolio market value
}

export interface PortfolioSummary {
  holdings: HoldingMetrics[];
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPct: number;
  bestPerformer: HoldingMetrics | null;
  worstPerformer: HoldingMetrics | null;
  sectorAllocation: { sector: string; value: number; weight: number }[];
  holdingsCount: number;
}

export function computeSummary(stocks: Stock[]): PortfolioSummary {
  const enriched = stocks.map((s) => {
    const shares = Number(s.shares) || 0;
    const purchase = Number(s.purchase_price) || 0;
    const current = Number(s.current_price) || purchase;
    const costBasis = shares * purchase;
    const marketValue = shares * current;
    const gain = marketValue - costBasis;
    const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    return {
      ...s,
      current_price: current,
      costBasis,
      marketValue,
      gain,
      gainPct,
      weight: 0,
    } as HoldingMetrics;
  });

  const totalValue = enriched.reduce((sum, h) => sum + h.marketValue, 0);
  const totalCost = enriched.reduce((sum, h) => sum + h.costBasis, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  enriched.forEach((h) => {
    h.weight = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
  });

  const sorted = [...enriched].sort((a, b) => b.gainPct - a.gainPct);
  const bestPerformer = sorted.length > 0 ? sorted[0] : null;
  const worstPerformer = sorted.length > 0 ? sorted[sorted.length - 1] : null;

  const sectorMap: Record<string, number> = {};
  enriched.forEach((h) => {
    const sector = h.sector || "Other";
    sectorMap[sector] = (sectorMap[sector] || 0) + h.marketValue;
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
