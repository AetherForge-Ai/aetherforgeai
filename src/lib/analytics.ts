/**
 * Portfolio analytics + actionable intelligence.
 *
 * Builds on the deterministic market-intel engine and the user's real holdings
 * to produce institutional-grade portfolio statistics (annualised volatility,
 * Sharpe ratio, health score, 7-day alpha potential) and an explicit action
 * layer: SELL recommendations drawn from current holdings, high-conviction BUY
 * candidates the user does NOT yet own, and three forward pathways.
 *
 * Pure module — safe on client and server.
 */

import type { Stock } from "@/lib/portfolio";
import {
  analyzeSecurity,
  universeFor,
  type AssetClass,
  type MarketCode,
  type SecurityIntel,
} from "@/lib/market-intel";

/** Market override for a holding — crypto anchors to the CRYPTO engine. */
function marketOverrideFor(s: Stock): MarketCode | undefined {
  return s.asset_type === "crypto" ? "CRYPTO" : undefined;
}

const RISK_FREE_ANNUAL = 0.045; // ~NZ/US short-rate blend
const TRADING_DAYS = 252;

export interface PortfolioMetrics {
  volatility: number; // annualised %, portfolio level
  sharpe: number; // annualised Sharpe ratio
  healthScore: number; // 0-100 composite health
  healthLabel: "Robust" | "Balanced" | "Fragile" | "At Risk";
  alphaPotentialPct: number; // projected weighted 7-day move %
  alphaPotentialValue: number; // projected 7-day $ move
  diversification: number; // 0-100
  winRate: number; // % of holdings currently in profit
  avgConviction: number; // 0-100 avg signal score
}

export interface HoldingIntel {
  stock: Stock;
  intel: SecurityIntel;
  weight: number; // % of portfolio value
  gain: number; // $ unrealised
  gainPct: number;
}

export interface SellRecommendation {
  ticker: string;
  name: string;
  price: number;
  signal: SecurityIntel["signal"];
  reasoning: string;
  weight: number;
  gainPct: number;
  urgency: "high" | "medium";
}

export interface BuyCandidate {
  ticker: string;
  name: string;
  market: SecurityIntel["market"];
  sector: string;
  price: number;
  currency: SecurityIntel["currency"];
  signal: SecurityIntel["signal"];
  score: number;
  projected7dPct: number;
  confidence: number;
  reasoning: string;
}

export interface Pathway {
  name: string;
  risk: "Low Risk" | "Balanced" | "High Risk";
  targetPct: number; // projected 7-day portfolio move
  probability: number; // 0-100
  summary: string;
  steps: string[];
}

export interface ActionableIntelligence {
  actionRequired: boolean;
  sellRecommendations: SellRecommendation[];
  buyCandidates: BuyCandidate[];
  pathways: Pathway[];
}

function round(v: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

function pctReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) out.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Enrich each holding with live technical intel + portfolio weight. */
export function enrichHoldings(stocks: Stock[]): HoldingIntel[] {
  const withValue = stocks.map((s) => {
    const shares = Number(s.shares) || 0;
    const current = Number(s.current_price) || Number(s.purchase_price) || 0;
    return { s, marketValue: shares * current };
  });
  const totalValue = withValue.reduce((sum, w) => sum + w.marketValue, 0);

  return withValue.map(({ s, marketValue }) => {
    const intel = analyzeSecurity(
      s.ticker,
      Number(s.current_price) || undefined,
      s.company_name,
      marketOverrideFor(s)
    );
    const shares = Number(s.shares) || 0;
    const cost = shares * (Number(s.purchase_price) || 0);
    const gain = marketValue - cost;
    return {
      stock: s,
      intel,
      weight: totalValue > 0 ? round((marketValue / totalValue) * 100, 2) : 0,
      gain: round(gain, 2),
      gainPct: cost > 0 ? round((gain / cost) * 100, 2) : 0,
    };
  });
}

export function computePortfolioMetrics(stocks: Stock[]): PortfolioMetrics {
  const holdings = enrichHoldings(stocks);
  const empty: PortfolioMetrics = {
    volatility: 0,
    sharpe: 0,
    healthScore: 0,
    healthLabel: "Balanced",
    alphaPotentialPct: 0,
    alphaPotentialValue: 0,
    diversification: 0,
    winRate: 0,
    avgConviction: 0,
  };
  if (!holdings.length) return empty;

  const totalValue = holdings.reduce(
    (s, h) => s + (Number(h.stock.shares) || 0) * (Number(h.stock.current_price) || 0),
    0
  );

  // Build a weighted portfolio daily-return series from each holding's history.
  const len = Math.min(...holdings.map((h) => h.intel.history.length));
  const portReturns: number[] = [];
  for (let day = 1; day < len; day++) {
    let r = 0;
    holdings.forEach((h) => {
      const prices = h.intel.history.map((p) => p.price);
      const prev = prices[prices.length - len + day - 1];
      const cur = prices[prices.length - len + day];
      if (prev > 0) r += (h.weight / 100) * ((cur - prev) / prev);
    });
    portReturns.push(r);
  }

  const dailyVol = std(portReturns);
  const volatility = round(dailyVol * Math.sqrt(TRADING_DAYS) * 100, 1);
  const annualReturn = mean(portReturns) * TRADING_DAYS;
  const annualVol = dailyVol * Math.sqrt(TRADING_DAYS);
  const sharpe = annualVol > 0 ? round((annualReturn - RISK_FREE_ANNUAL) / annualVol, 2) : 0;

  // 7-day alpha potential (weighted projection).
  const alphaPotentialPct = round(
    holdings.reduce((s, h) => s + (h.weight / 100) * h.intel.projected7dPct, 0),
    2
  );
  const alphaPotentialValue = round(totalValue * (alphaPotentialPct / 100), 2);

  // Diversification: distinct sectors relative to a healthy target of ~6.
  const sectors = new Set(holdings.map((h) => h.intel.sector));
  const diversification = round(clamp((sectors.size / Math.min(6, Math.max(holdings.length, 1))) * 100, 0, 100), 0);

  const winRate = round((holdings.filter((h) => h.gain >= 0).length / holdings.length) * 100, 0);
  const avgConviction = round(mean(holdings.map((h) => h.intel.score)), 0);

  // Health score composite.
  const volScore = clamp(100 - (volatility - 15) * 2.2, 0, 100); // 15% vol ~ ideal
  const healthScore = round(
    clamp(0.32 * avgConviction + 0.22 * diversification + 0.24 * volScore + 0.22 * winRate, 0, 100),
    0
  );
  const healthLabel: PortfolioMetrics["healthLabel"] =
    healthScore >= 75 ? "Robust" : healthScore >= 55 ? "Balanced" : healthScore >= 38 ? "Fragile" : "At Risk";

  return {
    volatility,
    sharpe,
    healthScore,
    healthLabel,
    alphaPotentialPct,
    alphaPotentialValue,
    diversification,
    winRate,
    avgConviction,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function buildActionableIntelligence(
  stocks: Stock[],
  assetClass: AssetClass = "stock",
  /**
   * Live-analysed universe (from /api/market). When supplied, BUY candidates are
   * drawn from these LIVE-priced securities so the "High-Conviction Buys" list
   * changes as the market moves — instead of the frozen deterministic set.
   */
  liveUniverse?: SecurityIntel[] | null
): ActionableIntelligence {
  const holdings = enrichHoldings(stocks);
  const heldTickers = new Set(holdings.map((h) => h.stock.ticker.toUpperCase()));

  // SELL recommendations — current holdings flagged Reduce/Sell.
  const sellRecommendations: SellRecommendation[] = holdings
    .filter((h) => h.intel.signal === "Sell" || h.intel.signal === "Reduce")
    .sort((a, b) => a.intel.score - b.intel.score)
    .map((h) => ({
      ticker: h.stock.ticker,
      name: h.intel.name,
      price: h.intel.price,
      signal: h.intel.signal,
      reasoning: h.intel.reasoning,
      weight: h.weight,
      gainPct: h.gainPct,
      urgency: h.intel.signal === "Sell" || h.weight >= 15 ? "high" : "medium",
    }));

  // BUY candidates — high-conviction names NOT already held, ranked across the
  // FULL investable universe (NZX + ASX + Dow Jones + NASDAQ + Crypto) when a
  // combined live universe is supplied. Falls back to BOTH deterministic
  // universes only when no live data is available.
  const candidatePool: SecurityIntel[] =
    liveUniverse && liveUniverse.length
      ? liveUniverse
      : [
          ...universeFor("stock").map((e) => analyzeSecurity(e.ticker, undefined, undefined, e.market)),
          ...universeFor("crypto").map((e) => analyzeSecurity(e.ticker, undefined, undefined, e.market)),
        ];

  // Rank by highest projected 7-day growth first (the best upside), with
  // conviction score as a tie-breaker. Show the top 20 across all markets.
  const buyCandidates: BuyCandidate[] = candidatePool
    .filter((i) => !heldTickers.has(i.ticker.toUpperCase()))
    .filter((i) => i.signal === "Strong Buy" || i.signal === "Buy")
    .sort((a, b) => {
      const growthDiff = (b.projected7dPct ?? 0) - (a.projected7dPct ?? 0);
      if (Math.abs(growthDiff) > 0.01) return growthDiff;
      return b.score * (b.confidence / 100) - a.score * (a.confidence / 100);
    })
    .slice(0, 20)
    .map((i) => ({
      ticker: i.ticker,
      name: i.name,
      market: i.market,
      sector: i.sector,
      price: i.price,
      currency: i.currency,
      signal: i.signal,
      score: i.score,
      projected7dPct: i.projected7dPct,
      confidence: i.confidence,
      reasoning: i.reasoning,
    }));

  const metrics = computePortfolioMetrics(stocks);
  const base = metrics.alphaPotentialPct;
  const vol = metrics.volatility;

  const pathways: Pathway[] = [
    {
      name: "Capital Preservation",
      risk: "Low Risk",
      targetPct: round(base * 0.4, 2),
      probability: 74,
      summary: "Protect gains, cut the weakest signals, and rotate into defensive quality.",
      steps: [
        sellRecommendations[0]
          ? `Trim ${sellRecommendations[0].ticker} to reduce single-name risk`
          : "Trim any position exceeding 15% of portfolio weight",
        "Rotate proceeds into utilities/healthcare names with RSI 40-60",
        "Hold 10-15% cash buffer for volatility spikes",
      ],
    },
    {
      name: "Balanced Growth",
      risk: "Balanced",
      targetPct: round(base, 2),
      probability: 58,
      summary: "Hold the core, act on the strongest signals, keep diversification intact.",
      steps: [
        buyCandidates[0]
          ? `Initiate a starter position in ${buyCandidates[0].ticker} (score ${buyCandidates[0].score})`
          : "Add one new sector to lift diversification",
        sellRecommendations[0]
          ? `Reduce ${sellRecommendations[0].ticker} on the flagged weakness`
          : "Maintain current weights; no urgent exits",
        "Rebalance so no single holding exceeds 20%",
      ],
    },
    {
      name: "Aggressive Alpha",
      risk: "High Risk",
      targetPct: round(base * 2 + vol * 0.15, 2),
      probability: 34,
      summary: "Concentrate into the highest-conviction momentum names — higher variance.",
      steps: [
        buyCandidates
          .slice(0, 2)
          .map((b) => b.ticker)
          .join(" & ")
          ? `Overweight ${buyCandidates.slice(0, 2).map((b) => b.ticker).join(" & ")}`
          : "Overweight your two strongest Strong-Buy signals",
        "Use tight stops (~5-7%) to cap downside on the concentrated book",
        "Accept elevated volatility for the higher projected return",
      ],
    },
  ];

  return {
    actionRequired: sellRecommendations.length > 0,
    sellRecommendations,
    buyCandidates,
    pathways,
  };
}
