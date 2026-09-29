/**
 * Apex report engine.
 *
 * Produces the structured "Ultra Advanced Apex-State" report shown in the
 * marketing demo modals (fake-but-realistic data) and in the subscriber
 * dashboard (built from the user's real holdings). Pure module — safe on
 * client and server. No Math.random at import time; a small seeded RNG keeps
 * demo output stable so charts don't jump between renders.
 */

import {
  analyzeUniverse,
  analyzeSecurity,
  getProjectionLeaders,
  getMarketNews,
  marketsForAssetClass,
  currencyForMarket,
  universeFor,
  type MarketCode,
  type SecurityIntel,
} from "./market-intel";
import {
  currencyForTicker,
  baseCurrencyForBot,
  convertCurrency,
  BASELINE_FX_TO_NZD,
  type CurrencyCode,
  type FxRatesToNZD,
} from "./currency";
import { ZENITH_STATE_LABEL } from "./zenith";
import type { IntelligenceBriefing } from "./briefing";
import {
  alignedProjection,
  candidateIsSuitable,
  deploymentGuard,
  isConstructiveCard,
  rateAsset,
  type DeploymentGuard,
  type TapeRead,
} from "./report-consistency";

export type BotKind = "stock" | "crypto";

export interface MomentumPoint {
  label: string; // month label, e.g. "Aug"
  value: number; // share/coin price that month
}

export interface DayPrediction {
  day: string; // "Day 1" … "Day 7"
  direction: "up" | "down" | "flat";
  movePct: number; // expected % move that day
  confidence: number; // 0-100
}

export interface Pathway {
  name: "Safe" | "Medium-Risk" | "Volatile";
  targetPct: number; // projected 7-day move
  probability: number; // 0-100
  narrative: string;
}

export interface TickerAnalysis {
  ticker: string;
  name: string;
  price: number;
  changePct: number; // last-session move
  signal: "Strong Buy" | "Buy" | "Accumulate" | "Hold" | "Watch" | "Reduce" | "Sell";
  /** When set, the card chart is a recent path rather than a seeded 12-month line. */
  momentumLabel?: string;
  sentiment: number; // 0-100
  momentum: MomentumPoint[]; // 12 months
  momentum12moPct: number;
  shortTerm: DayPrediction[]; // 7 days
  pathways: Pathway[]; // 3 scenarios
  note: string;
}

/* --------------------- Advanced Apex report sections -------------------- */

/** One row in a market-movers table (a single security's move over a window). */
export interface MoverRow {
  ticker: string;
  name: string;
  market: MarketCode;
  currency: CurrencyCode;
  price: number;
  changePct: number;
}

/** Top-10 movers for one exchange, across the 24h / 7d / 1-month windows. */
export interface MarketMoversGroup {
  market: MarketCode;
  label: string; // "New Zealand Exchange · NZX"
  windows: { window: string; movers: MoverRow[] }[];
}

/** A high-conviction 7-day forward projection row. */
export interface ProjectionRow {
  ticker: string;
  name: string;
  market: MarketCode;
  currency: CurrencyCode;
  price: number;
  projected7dPct: number;
  confidence: number;
  signal: SecurityIntel["signal"];
}

/** Regional / sector news grouped by geography. */
export interface RegionalNewsGroup {
  region: string; // "New Zealand" | "Australia" | "United States" | "Global Macro" | "Digital Assets"
  market: MarketCode | "Global";
  items: { headline: string; source: string; impact: "Bullish" | "Bearish" | "Neutral"; time: string }[];
}

/** A clear, direct buy/sell/hold instruction on a specific security. */
export interface DirectRecommendation {
  action: "SELL" | "TRIM" | "BUY" | "ACCUMULATE" | "HOLD";
  ticker: string;
  name: string;
  currency: CurrencyCode;
  price: number;
  projected7dPct: number;
  detail: string; // "Sell CPU.AX — the 7-day model projects -8.2% …"
  /** Base-case 7-day range quoted everywhere for this name, when known. */
  baseRange?: string;
  urgency: "high" | "medium" | "low";
  held: boolean; // true if this is a current holding, false for new buy candidates
}

/** A forward pathway with concrete step-by-step actions. */
export interface PortfolioPathway {
  name: string;
  risk: "Low Risk" | "Balanced" | "High Risk";
  targetPct: number; // projected 7-day portfolio move
  probability: number; // 0-100
  summary: string;
  steps: string[];
  recommended: boolean;
}

/** The three-pathway plan plus the bot's single recommended route forward. */
export interface PathwayPlan {
  pathways: PortfolioPathway[];
  recommendedName: string;
  recommendationNote: string;
}

export interface ApexReport {
  bot: BotKind;
  title: string;
  marketLabel: string;
  generatedLabel: string;
  isDemo: boolean;
  /** AI engine that produced this report, e.g. "SuperGrok 4.6 · Ultra Advanced ZENITH State". */
  engine: string;
  executiveSummary: string;
  topGainers: { ticker: string; name: string; changePct: number }[];
  keyObservations: string[];
  newsSynthesis: { headline: string; source: string; impact: "Bullish" | "Bearish" | "Neutral" }[];
  tickers: TickerAnalysis[];
  portfolio?: { value: number; pnl: number; pnlPct: number; currency: CurrencyCode };
  // Advanced multi-timeframe sweep sections (present on every report).
  marketMovers: MarketMoversGroup[];
  projectionLeaders: ProjectionRow[];
  regionalNews: RegionalNewsGroup[];
  directRecommendations: DirectRecommendation[];
  pathwayPlan: PathwayPlan;
  /**
   * Concise, high-signal intelligence briefing + probabilistic 7-day outlook.
   * Optional: attached by the server report pipeline (report-service / bot run)
   * once technicals, the economic calendar and news sentiment are available.
   */
  briefing?: IntelligenceBriefing;
}

/* --------------------------------- RNG ---------------------------------- */

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];

/* ------------------------------ Directories ----------------------------- */

// NZ-focused demo universe (NZX + ASX) so the marketing demo feels local.
const DEMO_STOCKS = [
  { ticker: "AIR.NZ", name: "Air New Zealand" },
  { ticker: "FPH.NZ", name: "Fisher & Paykel Healthcare" },
  { ticker: "MEL.NZ", name: "Meridian Energy" },
  { ticker: "SPK.NZ", name: "Spark New Zealand" },
  { ticker: "ATM.NZ", name: "The a2 Milk Company" },
  { ticker: "CEN.NZ", name: "Contact Energy" },
  { ticker: "BHP.AX", name: "BHP Group" },
  { ticker: "CBA.AX", name: "Commonwealth Bank" },
];

const DEMO_CRYPTO = [
  { ticker: "BTC", name: "Bitcoin" },
  { ticker: "ETH", name: "Ethereum" },
  { ticker: "SOL", name: "Solana" },
  { ticker: "XRP", name: "XRP" },
  { ticker: "ADA", name: "Cardano" },
  { ticker: "LINK", name: "Chainlink" },
];

export const CRYPTO_DIRECTORY = [
  { ticker: "BTC", name: "Bitcoin", price: 96850 },
  { ticker: "ETH", name: "Ethereum", price: 3420 },
  { ticker: "SOL", name: "Solana", price: 198.4 },
  { ticker: "XRP", name: "XRP", price: 2.31 },
  { ticker: "ADA", name: "Cardano", price: 0.98 },
  { ticker: "LINK", name: "Chainlink", price: 24.7 },
  { ticker: "DOGE", name: "Dogecoin", price: 0.38 },
  { ticker: "AVAX", name: "Avalanche", price: 41.2 },
  { ticker: "DOT", name: "Polkadot", price: 8.15 },
  { ticker: "MATIC", name: "Polygon", price: 0.62 },
  { ticker: "JUP", name: "Jupiter", price: 0.85 },
];

const SIGNALS: TickerAnalysis["signal"][] = ["Strong Buy", "Accumulate", "Hold", "Watch", "Reduce"];

/* ----------------------------- Synthesis -------------------------------- */

function round(v: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

/** Build a full per-ticker analysis deterministically from a seed. */
function synthesizeTicker(
  ticker: string,
  name: string,
  basePrice: number,
  bot: BotKind,
  seedKey: string
): TickerAnalysis {
  const rnd = mulberry32(hashSeed(seedKey + ticker));
  const vol = bot === "crypto" ? 0.13 : 0.06; // crypto swings harder

  // 12-month momentum series ending near basePrice.
  const drift = (rnd() - 0.42) * (bot === "crypto" ? 0.9 : 0.5); // overall trend
  const start = basePrice / (1 + drift);
  const momentum: MomentumPoint[] = [];
  let price = start;
  for (let i = 0; i < 12; i++) {
    const step = (drift / 11) + (rnd() - 0.5) * vol;
    price = Math.max(0.01, price * (1 + step));
    momentum.push({ label: MONTHS[i], value: round(price, basePrice < 5 ? 4 : 2) });
  }
  // Pin the final point to basePrice so the chart matches the quoted price.
  momentum[11] = { label: MONTHS[11], value: round(basePrice, basePrice < 5 ? 4 : 2) };
  const momentum12moPct = round(((basePrice - start) / start) * 100, 1);

  const changePct = round((rnd() - 0.45) * (bot === "crypto" ? 9 : 3.5), 2);
  const sentiment = Math.round(45 + rnd() * 50);
  const signal =
    SIGNALS[
      momentum12moPct > 25 ? 0 : momentum12moPct > 8 ? 1 : momentum12moPct > -5 ? 2 : momentum12moPct > -15 ? 3 : 4
    ];

  // 7-day short-term predictions.
  const shortTerm: DayPrediction[] = [];
  for (let d = 1; d <= 7; d++) {
    const r = rnd();
    const movePct = round((r - 0.46) * vol * 100, 2);
    shortTerm.push({
      day: `Day ${d}`,
      direction: movePct > 0.3 ? "up" : movePct < -0.3 ? "down" : "flat",
      movePct,
      confidence: Math.round(58 + rnd() * 34),
    });
  }

  // 3 forward pathways.
  const cumulative = shortTerm.reduce((s, p) => s + p.movePct, 0);
  const pathways: Pathway[] = [
    {
      name: "Safe",
      targetPct: round(cumulative * 0.4, 1),
      probability: Math.round(52 + rnd() * 20),
      narrative: "Range-bound consolidation with defensive support holding. Capital preservation base case.",
    },
    {
      name: "Medium-Risk",
      targetPct: round(cumulative, 1),
      probability: Math.round(30 + rnd() * 18),
      narrative: "Momentum continuation in line with the 12-month trend and prevailing sentiment.",
    },
    {
      name: "Volatile",
      targetPct: round(cumulative * (bot === "crypto" ? 2.6 : 1.9), 1),
      probability: Math.round(12 + rnd() * 16),
      narrative:
        bot === "crypto"
          ? "High-beta breakout / breakdown driven by liquidity, funding rates and macro catalysts."
          : "Catalyst-driven repricing on earnings, guidance or sector rotation.",
    },
  ];

  const note =
    signal === "Strong Buy" || signal === "Accumulate"
      ? `${ticker} shows constructive momentum (${momentum12moPct > 0 ? "+" : ""}${momentum12moPct}% over 12m) with sentiment at ${sentiment}/100.`
      : signal === "Hold"
        ? `${ticker} is consolidating; no decisive edge this week. Monitor for a break of range.`
        : `${ticker} is losing relative strength; tighten risk and watch key support.`;

  return {
    ticker,
    name,
    price: round(basePrice, basePrice < 5 ? 4 : 2),
    changePct,
    signal,
    sentiment,
    momentum,
    momentum12moPct,
    shortTerm,
    pathways,
    note,
  };
}

/* --------------------- Advanced-section computation --------------------- */

/** Per-asset card built from the same SecurityIntel the recommendations use. */
function tickerFromIntel(intel: SecurityIntel, _bot: BotKind): TickerAnalysis {
  const rating = rateAsset(intel);
  const aligned = alignedProjection(intel);
  const history = intel.history.length ? intel.history : [{ label: "Now", price: intel.price }];
  const momentum: MomentumPoint[] = history.map((p) => ({ label: p.label, value: p.price }));
  let remaining = aligned.pct;
  const shortTerm: DayPrediction[] = [];
  for (let d = 1; d <= 7; d++) {
    const movePct = d === 7 ? round(remaining, 2) : round(aligned.pct / 7, 2);
    remaining = round(remaining - movePct, 2);
    shortTerm.push({
      day: `Day ${d}`,
      direction: movePct > 0.05 ? "up" : movePct < -0.05 ? "down" : "flat",
      movePct,
      confidence: intel.confidence,
    });
  }
  const bearMid = round((intel.outlook.bear.lowPct + intel.outlook.bear.highPct) / 2, 2);
  const bullMid = round((intel.outlook.bull.lowPct + intel.outlook.bull.highPct) / 2, 2);
  const pathways: Pathway[] = [
    {
      name: "Safe",
      targetPct: bearMid,
      probability: intel.outlook.bear.probability,
      narrative: `Bear case ${spPct(intel.outlook.bear.lowPct)} to ${spPct(intel.outlook.bear.highPct)}.`,
    },
    {
      name: "Medium-Risk",
      targetPct: aligned.pct,
      probability: intel.outlook.base.probability,
      narrative: `Base case ${aligned.range} — the same range quoted in the summary.`,
    },
    {
      name: "Volatile",
      targetPct: bullMid,
      probability: intel.outlook.bull.probability,
      narrative: `Bull case ${spPct(intel.outlook.bull.lowPct)} to ${spPct(intel.outlook.bull.highPct)}.`,
    },
  ];
  const momentumNote = rating.positiveMomentum
    ? "This is a positive-momentum rating."
    : "This is not a positive-momentum rating.";
  return {
    ticker: intel.ticker,
    name: intel.name,
    price: intel.price,
    changePct: intel.change1d,
    signal: rating.cardSignal,
    sentiment: intel.score,
    momentum,
    momentum12moPct: intel.change30d,
    momentumLabel: "Recent price path",
    shortTerm,
    pathways,
    note: `${intel.ticker} is ${rating.action} — ${intel.regime}, MACD ${intel.macdSignal}, RSI ${intel.rsi}. 7-day base case ${aligned.range} (${aligned.probability}% odds, midpoint ${spPct(aligned.pct)}). ${momentumNote}`,
  };
}

function spPct(n: number): string {
  const rounded = round(n, 2);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

const MARKET_LABELS: Record<MarketCode, string> = {
  NZX: "New Zealand Exchange · NZX",
  ASX: "Australian Securities Exchange · ASX",
  US: "US Markets · NYSE / NASDAQ",
  CRYPTO: "Global Digital Assets",
};

const REGION_LABELS: Record<MarketCode | "Global", string> = {
  NZX: "New Zealand",
  ASX: "Australia",
  US: "United States",
  CRYPTO: "Digital Assets",
  Global: "Global Macro",
};

/** Resolve the exchange for a ticker under a given bot. */
function marketForTicker(ticker: string, bot: BotKind): MarketCode {
  if (bot === "crypto") return "CRYPTO";
  const t = (ticker || "").toUpperCase();
  if (t.endsWith(".NZ")) return "NZX";
  if (t.endsWith(".AX")) return "ASX";
  return "US";
}

const MOVER_WINDOWS: { window: string; key: keyof SecurityIntel }[] = [
  { window: "Last 24 hours", key: "change1d" },
  { window: "Last 7 days", key: "change7d" },
  { window: "Last month", key: "change30d" },
];

/**
 * Full multi-timeframe mover sweep — Top 10 gainers for each exchange across
 * the 24-hour, 7-day and 1-month windows. Stocks yield NZX/ASX/US groups;
 * crypto yields a single digital-assets group.
 */
function buildMarketMovers(
  bot: BotKind,
  overrides?: Record<string, number>,
  universeIntel?: SecurityIntel[]
): MarketMoversGroup[] {
  // When a full-market intel set is supplied (e.g. the complete live crypto
  // market for a Koins report), the movers board is built from it directly —
  // never the deterministic core universe. Pure to the bot's own asset class.
  const list = universeIntel && universeIntel.length ? universeIntel : analyzeUniverse(overrides, bot);
  const markets = marketsForAssetClass(bot);
  return markets.map((m) => {
    const inMarket = list.filter((s) => s.market === m);
    return {
      market: m,
      label: MARKET_LABELS[m],
      windows: MOVER_WINDOWS.map((w) => ({
        window: w.window,
        movers: [...inMarket]
          .sort((a, b) => (b[w.key] as number) - (a[w.key] as number))
          .slice(0, 10)
          .map((s) => ({
            ticker: s.ticker,
            name: s.name,
            market: s.market,
            currency: s.currency as CurrencyCode,
            price: s.price,
            changePct: s[w.key] as number,
          })),
      })),
    };
  });
}

/** The top-10 highest-conviction 7-day forward projections across the sweep. */
function buildProjectionLeaders(
  bot: BotKind,
  overrides?: Record<string, number>,
  universeIntel?: SecurityIntel[]
): ProjectionRow[] {
  const list = universeIntel && universeIntel.length ? universeIntel : analyzeUniverse(overrides, bot);
  return getProjectionLeaders(10, list).map((s) => ({
    ticker: s.ticker,
    name: s.name,
    market: s.market,
    currency: s.currency as CurrencyCode,
    price: s.price,
    projected7dPct: s.projected7dPct,
    confidence: s.confidence,
    signal: s.signal,
  }));
}

/** News broadcasts / press releases grouped by region (NZ, AU, US, Global). */
function buildRegionalNews(bot: BotKind): RegionalNewsGroup[] {
  const news = getMarketNews(bot);
  const order: (MarketCode | "Global")[] =
    bot === "crypto" ? ["CRYPTO", "Global"] : ["NZX", "ASX", "US", "Global"];
  return order
    .map((m) => ({
      region: REGION_LABELS[m],
      market: m,
      items: news
        .filter((n) => n.market === m)
        .map((n) => ({ headline: n.headline, source: n.source, impact: n.impact, time: n.time })),
    }))
    .filter((g) => g.items.length > 0);
}

/** A lightweight holding shape used to compute portfolio-specific guidance. */
interface AnalyzableHolding {
  ticker: string;
  name: string;
  price: number;
  shares?: number;
  purchasePrice?: number;
  market: MarketCode;
  currency: CurrencyCode;
}

/**
 * Direct, plain-English recommendations for the user's actual holdings, plus a
 * short list of high-conviction new buy candidates. Sells surface first so the
 * user sees the most urgent action (e.g. "Sell CPU.AX …") at the top.
 */
function holdingDetail(action: DirectRecommendation["action"], ticker: string, range: string, probability: number, pct: number): string {
  const mid = `7-day base case ${range} (${probability}% odds, midpoint ${spPct(pct)})`;
  switch (action) {
    case "SELL":
      return `Sell ${ticker} — ${mid}. Exit to protect capital before a sharper drawdown.`;
    case "TRIM":
      return `Trim ${ticker} — ${mid}. Take some risk off.`;
    case "ACCUMULATE":
      return `Accumulate ${ticker} — ${mid}. Add only in a size that matches that conviction.`;
    case "BUY":
      return `Buy ${ticker} — ${mid}. A measured top-up matches this rating.`;
    default:
      return `Hold ${ticker} — ${mid}. Maintain the position and monitor.`;
  }
}

function buildDirectRecommendations(
  holdings: AnalyzableHolding[],
  bot: BotKind,
  universeIntel?: SecurityIntel[],
  opts?: {
    cashBalanceNZD?: number;
    cashHeavy?: boolean;
    holdingIntel?: SecurityIntel[];
    tape?: TapeRead;
    /** Filled with new names left off the buy list by the suitability guard. */
    skippedNames?: string[];
  }
): DirectRecommendation[] {
  const held = new Set(holdings.map((h) => h.ticker.toUpperCase()));
  const intelByTicker = new Map((opts?.holdingIntel ?? []).map((i) => [i.ticker.toUpperCase(), i]));
  const guard = opts?.tape ? deploymentGuard(bot, opts.tape, opts.cashBalanceNZD ?? 0) : undefined;

  const fromHoldings: DirectRecommendation[] = holdings.map((h) => {
    const intel =
      intelByTicker.get(h.ticker.toUpperCase()) ??
      analyzeSecurity(h.ticker, h.price > 0 ? h.price : undefined, h.name, h.market);
    const aligned = alignedProjection(intel);
    const rating = rateAsset(intel);
    return {
      ticker: h.ticker,
      name: h.name,
      currency: h.currency,
      price: intel.price,
      projected7dPct: aligned.pct,
      baseRange: aligned.range,
      held: true,
      action: rating.action,
      urgency: rating.action === "SELL" ? ("high" as const) : rating.action === "TRIM" ? ("medium" as const) : ("low" as const),
      detail: holdingDetail(rating.action, h.ticker, aligned.range, aligned.probability, aligned.pct),
    };
  });

  // High-conviction buy candidates the user does NOT already own. When a
  // full-market intel set is supplied (e.g. the complete live crypto market),
  // buy candidates are screened across the ENTIRE market rather than the small
  // deterministic core — so Koins names specific coins to BUY from the whole
  // cryptocurrency market, at parity with Stox. We surface up to 8 named buys so
  // every report — especially cash-only / cash-heavy books — gives concrete,
  // specific BUY/ACCUMULATE instructions (never vague class-only advice).
  const cashHeavy = !!opts?.cashHeavy || holdings.length === 0;
  const buyLimit = guard ? guard.maxNewNames : cashHeavy ? 8 : 6;
  const candidatePool: SecurityIntel[] =
    universeIntel && universeIntel.length
      ? universeIntel.filter((i) => !held.has(i.ticker.toUpperCase()))
      : universeFor(bot)
          .filter((e) => !held.has(e.ticker.toUpperCase()))
          .map((e) => analyzeSecurity(e.ticker, undefined, e.name, e.market));

  const ranked = [...candidatePool].sort(
    (a, b) => b.score * (b.confidence / 100) - a.score * (a.confidence / 100)
  );
  const suitable = guard
    ? ranked.filter((i) => candidateIsSuitable(i, guard))
    : ranked.filter((i) => i.signal === "Strong Buy" || i.signal === "Buy");
  if (guard && opts?.skippedNames) {
    const skipped = ranked
      .filter((i) => (i.signal === "Strong Buy" || i.signal === "Buy") && !candidateIsSuitable(i, guard))
      .slice(0, 5)
      .map((i) => i.ticker);
    opts.skippedNames.push(...skipped);
  }

  const buyCandidates: DirectRecommendation[] = suitable.slice(0, buyLimit).map((i) => {
      const action = rateAsset(i).action === "ACCUMULATE" ? "ACCUMULATE" : "BUY";
      const cashAvail = Math.max(0, opts?.cashBalanceNZD || 0);
      const deploy = guard
        ? guard.mode === "starter"
          ? ` Starter size only — do not deploy the full cash balance.`
          : ""
        : cashHeavy && cashAvail > 0
          ? ` Deploy dry powder (cash NZ$${Math.round(cashAvail)} available) with a measured starter size.`
          : cashHeavy
            ? " Prioritise this name for first capital when cash is deposited."
            : "";
      return {
        action: action as "ACCUMULATE" | "BUY",
        ticker: i.ticker,
        name: i.name,
        currency: i.currency as CurrencyCode,
        price: i.price,
        projected7dPct: i.projected7dPct,
        baseRange: spPct(i.projected7dPct),
        held: false,
        urgency: (cashHeavy && !guard ? "medium" : "low") as "medium" | "low",
        detail: `${action === "ACCUMULATE" ? "Accumulate" : "Buy"} **${i.ticker}** (${i.name}, ${i.market}) — **${action}** with a 7-day model of ${spPct(i.projected7dPct)} at **${i.confidence}%** confidence.${deploy}`,
      };
    });

  const urgencyRank = { high: 0, medium: 1, low: 2 } as const;
  return [...fromHoldings, ...buyCandidates].sort(
    (a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency]
  );
}

/**
 * Three forward pathways (low / medium / high risk) with concrete step-by-step
 * instructions, plus the single route the bot recommends given the current
 * signal mix. Portfolio alpha is the value-weighted 7-day projected move.
 */
function buildPathwayPlan(
  holdings: AnalyzableHolding[],
  recs: DirectRecommendation[],
  bot: BotKind,
  holdingIntel?: SecurityIntel[],
  guard?: DeploymentGuard
): PathwayPlan {
  const intelByTicker = new Map((holdingIntel ?? []).map((i) => [i.ticker.toUpperCase(), i]));
  // Value-weighted 7-day alpha across the actual book, using the same intel as the cards.
  const enriched = holdings.map((h) => ({
    h,
    intel:
      intelByTicker.get(h.ticker.toUpperCase()) ??
      analyzeSecurity(h.ticker, h.price > 0 ? h.price : undefined, h.name, h.market),
    value: (h.shares || 0) * (h.price || 0),
  }));
  const totalValue = enriched.reduce((s, e) => s + e.value, 0);
  const alpha =
    totalValue > 0
      ? round(
          enriched.reduce((s, e) => s + (e.value / totalValue) * alignedProjection(e.intel).pct, 0),
          2
        )
      : round(
          enriched.reduce((s, e) => s + alignedProjection(e.intel).pct, 0) / Math.max(enriched.length, 1),
          2
        );

  const sells = recs.filter((r) => r.held && (r.action === "SELL" || r.action === "TRIM"));
  const strongs = recs.filter((r) => r.action === "ACCUMULATE");
  const buys = recs.filter((r) => !r.held);
  const topBuy = buys[0];
  const topTwoBuys = buys.slice(0, 2).map((b) => b.ticker);
  const asset = bot === "crypto" ? "coin" : "position";

  // Recommendation logic: heavy sell pressure → preserve; strong momentum with
  // manageable risk → balanced; otherwise balanced as the sensible default.
  let recommendedName: string;
  let recommendationNote: string;
  if (guard && guard.mode !== "full") {
    recommendedName = guard.mode === "defensive" || sells.length > 0 ? "Capital Preservation" : "Balanced Growth";
    recommendationNote = guard.headline;
  } else if (holdings.length === 0 && buys.length > 0) {
    recommendedName = "Balanced Growth";
    recommendationNote = `Cash-ready / empty holdings — deploy into named BUY/ACCUMULATE tickers (${buys
      .slice(0, 3)
      .map((b) => b.ticker)
      .join(", ")}) with a measured starter size. Keep a cash buffer and scale in on strength.`;
  } else if (sells.length > strongs.length && sells.length > 0) {
    recommendedName = "Capital Preservation";
    recommendationNote = `${sells.length} holding${sells.length > 1 ? "s" : ""} flag downside risk this week — the recommended route is to de-risk first, lock in gains and rotate into quality before adding exposure.`;
  } else if (strongs.length >= 1 || alpha > 0) {
    recommendedName = "Balanced Growth";
    recommendationNote = `Signals are net constructive (portfolio 7-day alpha ${alpha > 0 ? "+" : ""}${alpha}%). The recommended route holds the core, acts on the strongest signals and keeps diversification intact.`;
  } else {
    recommendedName = "Balanced Growth";
    recommendationNote = `The tape is mixed — the recommended route is to stay balanced, make no forced moves and act only on the clearest signals.`;
  }

  const pathways: PortfolioPathway[] = [
    {
      name: "Capital Preservation",
      risk: "Low Risk",
      targetPct: round(alpha * 0.4, 2),
      probability: 74,
      summary: "Protect gains, cut the weakest signals and rotate into defensive quality.",
      steps: [
        sells[0]
          ? `Exit or trim ${sells[0].ticker} first — it carries the clearest downside signal.`
          : `Trim any single ${asset} exceeding ~15% of the book to cap concentration risk.`,
        bot === "crypto"
          ? "Rotate proceeds into large-cap majors (BTC/ETH) and hold a stablecoin buffer."
          : "Rotate proceeds into utilities / healthcare names with RSI in the 40–60 band.",
        "Keep a 10–15% cash (or stablecoin) buffer ready for volatility spikes.",
      ],
      recommended: recommendedName === "Capital Preservation",
    },
    {
      name: "Balanced Growth",
      risk: "Balanced",
      targetPct: round(alpha, 2),
      probability: 58,
      summary: "Hold the core, act on the strongest signals and keep diversification intact.",
      steps: [
        topBuy
          ? `Initiate a starter position in ${topBuy.ticker} — a leading ${bot === "crypto" ? "digital asset" : "name"} on this week's sweep.`
          : `Add one new ${bot === "crypto" ? "sector (e.g. DeFi or Layer-2)" : "sector"} to lift diversification.`,
        sells[0]
          ? `Reduce ${sells[0].ticker} on the flagged weakness and redeploy the proceeds.`
          : "Maintain current weights — no urgent exits are required this week.",
        `Rebalance so no single ${asset} exceeds ~20% of portfolio value.`,
      ],
      recommended: recommendedName === "Balanced Growth",
    },
    {
      name: "Aggressive Alpha",
      risk: "High Risk",
      targetPct: round(alpha * 2 + 1.5, 2),
      probability: 34,
      summary: "Concentrate into the highest-conviction momentum names — higher variance.",
      steps: [
        topTwoBuys.length
          ? `Overweight ${topTwoBuys.join(" & ")} — the strongest momentum signals on the sweep.`
          : "Overweight your two strongest Strong-Buy signals.",
        "Use tight stops (~5–7%) to cap downside on the concentrated book.",
        "Accept elevated volatility in exchange for the higher projected return.",
      ],
      recommended: false,
    },
  ];

  return { pathways, recommendedName, recommendationNote };
}

/* ------------------------------- Reports -------------------------------- */

interface ReportExtras {
  portfolio?: ApexReport["portfolio"];
  directRecommendations: DirectRecommendation[];
  pathwayPlan: PathwayPlan;
  /** Held tickers with size, e.g. "GNC.AX × 120, ARB × 40". */
  bookRoster?: string;
  tape?: TapeRead;
  guard?: DeploymentGuard;
  skippedSpeculative?: string[];
}

function consistentExecutiveSummary(
  bot: BotKind,
  heldRecs: DirectRecommendation[],
  positive: number,
  total: number,
  extras: ReportExtras
): string {
  const noun = bot === "crypto" ? "assets" : "holdings";
  const actions = heldRecs.length
    ? heldRecs
        .map((r) => `**${r.action} ${r.ticker}** (7-day base ${r.baseRange ?? spPct(r.projected7dPct)})`)
        .join("; ")
    : `no monitored ${noun} yet`;
  const roster = extras.bookRoster ? ` Live book: ${extras.bookRoster}.` : "";
  const buys = extras.directRecommendations
    .filter((r) => !r.held && (r.action === "BUY" || r.action === "ACCUMULATE"))
    .slice(0, 3)
    .map((r) => `${r.action} ${r.ticker} (${spPct(r.projected7dPct)})`);
  const buyLine = buys.length ? ` Suitable new names: ${buys.join(", ")}.` : "";
  const skipped =
    extras.skippedSpeculative && extras.skippedSpeculative.length
      ? ` Not sized this week: ${extras.skippedSpeculative.join(", ")}.`
      : "";
  return (
    `On the live book:${roster} ${actions}. ` +
    `${positive} of ${total} ${noun} carry a positive momentum signal — the same Buy or Accumulate rating on each card. ` +
    `${extras.guard?.headline ?? ""}` +
    buyLine +
    skipped +
    ` _Informational market intelligence only — not personalised financial advice._`
  );
}

function assembleReport(
  bot: BotKind,
  tickers: TickerAnalysis[],
  isDemo: boolean,
  extras: ReportExtras,
  marketOverrides?: Record<string, number>,
  universeIntel?: SecurityIntel[]
): ApexReport {
  const sorted = [...tickers].sort((a, b) => b.changePct - a.changePct);
  const topGainers = sorted
    .filter((t) => t.changePct > 0)
    .slice(0, 3)
    .map((t) => ({ ticker: t.ticker, name: t.name, changePct: t.changePct }));

  const strong = tickers.filter((t) => isConstructiveCard(t.signal));
  const weak = tickers.filter((t) => t.signal === "Reduce");
  const marketLabel = bot === "crypto" ? "BTC · ETH · Global digital assets" : "NZX · ASX · Global equities";

  const sweepLabel = bot === "crypto" ? "the complete digital-asset market" : "the complete NZX, ASX and US exchanges";
  const assetNoun = bot === "crypto" ? "coins" : "tickers";
  const bookRoster =
    extras.bookRoster ||
    tickers
      .slice(0, 12)
      .map((t) => t.ticker)
      .join(", ");
  const buyNames = extras.directRecommendations
    .filter((r) => !r.held && (r.action === "BUY" || r.action === "ACCUMULATE"))
    .slice(0, 4)
    .map((r) => r.ticker);
  const heldRecs = extras.directRecommendations.filter((r) => r.held);
  const positiveFromRecs = heldRecs.filter((r) => r.action === "BUY" || r.action === "ACCUMULATE").length;
  const momentumCount = extras.guard ? positiveFromRecs : strong.length;
  const momentumTotal = extras.guard ? heldRecs.length : tickers.length;
  const executiveSummary = extras.guard
    ? consistentExecutiveSummary(bot, heldRecs, momentumCount, momentumTotal, extras)
    :
    tickers.length === 0
      ? `**Ultra Advanced ZENITH State engaged.** SuperGrok 4.6 swept ${sweepLabel} for Top-10 movers and 7-day projection leaders. ` +
        `Your book has **no monitored ${assetNoun} yet** — this report leads with a concrete **BUY/ACCUMULATE** list` +
        (buyNames.length ? ` led by **${buyNames.join(", ")}**` : "") +
        ` so cash can be deployed with conviction and specific markets named. ` +
        `_Informational market intelligence only — not personalised financial advice._`
      : `**Ultra Advanced ZENITH State engaged.** ${isDemo ? "This sample book holds" : "Your live book holds"} **${tickers.length}** ${assetNoun}: **${bookRoster}**. ` +
        `SuperGrok 4.6 swept ${sweepLabel} against those positions — aggregate 7-day bias is **${strong.length >= weak.length ? "constructive" : "defensive"}** (${strong.length} accumulate-or-better, ${weak.length} elevated risk). ` +
        (buyNames.length
          ? `Priority new buys this week: **${buyNames.join(", ")}**. `
          : "") +
        `Below: portfolio standings, direct buy/sell recommendations on the held names and three forward pathways. ` +
        `_Informational market intelligence only — not personalised financial advice._`;

  const keyObservations =
    tickers.length === 0
      ? [
          `Empty holdings — leading with ${buyNames.length} named BUY/ACCUMULATE candidates from the full-market sweep.`,
          buyNames[0]
            ? `Top deploy candidate: **${buyNames[0]}** — see Direct Recommendations for conviction and projected 7-day move.`
            : "Run again once live market data is available to refresh the BUY board.",
          bot === "crypto"
            ? "Koins screened the complete crypto market — use the BUY list to put cash to work in specific coins."
            : "Stox screened NZX / ASX / US equities — use the BUY list to put cash to work in specific tickers.",
          "Keep a cash buffer; scale into positions in 2–3 tranches rather than a single fill.",
        ]
      : [
          `${isDemo ? "Sample book" : "Live book"} (${tickers.length}): ${bookRoster}.`,
          `${momentumCount} of ${momentumTotal} ${bot === "crypto" ? "assets" : "holdings"} carry a positive momentum signal into the week.`,
          topGainers[0]
            ? `${topGainers[0].ticker} leads the session (+${topGainers[0].changePct}%) and tops the gainer board.`
            : `No standout session gainers — the tape is consolidating.`,
          buyNames.length
            ? `Fresh capital candidates: ${buyNames.join(", ")}.`
            : bot === "crypto"
              ? "Cross-asset correlation remains elevated; BTC dominance is the primary risk driver."
              : "Sector rotation favours defensives; watch NZX yield names into the print.",
          "Volatile-pathway probabilities are contained, keeping tail risk secondary to the base case.",
          ...(extras.guard ? [extras.guard.headline] : []),
          ...(extras.skippedSpeculative && extras.skippedSpeculative.length
            ? [
                `Left off the buy list under this tape (moves or conviction are too aggressive to size): ${extras.skippedSpeculative.join(", ")}.`,
              ]
            : []),
        ];

  const newsSynthesis =
    bot === "crypto"
      ? [
          { headline: "Spot ETF net inflows extend a third straight week", source: "Global Digital Wire", impact: "Bullish" as const },
          { headline: "Funding rates cool from overheated levels", source: "DerivativesDesk", impact: "Neutral" as const },
          { headline: "Regulatory clarity advances in APAC markets", source: "Reg Monitor", impact: "Bullish" as const },
        ]
      : [
          { headline: "RBNZ holds the OCR; forward guidance turns dovish", source: "NZ Markets Daily", impact: "Bullish" as const },
          { headline: "ASX resources rally on firmer commodity prints", source: "ASX Wire", impact: "Bullish" as const },
          { headline: "NZD strength pressures exporter margins", source: "FX Observer", impact: "Bearish" as const },
        ];

  return {
    bot,
    title: bot === "crypto" ? "Koins · Crypto Market Intelligence Monitor" : "Stox · Stock Market Intelligence Monitor",
    marketLabel,
    generatedLabel: isDemo ? "Sample report · illustrative data" : "Live ZENITH run",
    isDemo,
    engine: ZENITH_STATE_LABEL,
    executiveSummary,
    topGainers,
    keyObservations,
    newsSynthesis,
    tickers,
    portfolio: extras.portfolio,
    marketMovers: buildMarketMovers(bot, marketOverrides, universeIntel),
    projectionLeaders: buildProjectionLeaders(bot, marketOverrides, universeIntel),
    regionalNews: buildRegionalNews(bot),
    directRecommendations: extras.directRecommendations,
    pathwayPlan: extras.pathwayPlan,
  };
}

/** Attach the real market of each holding + its native currency. */
function toAnalyzable(bot: BotKind, holdings: LiveHolding[]): AnalyzableHolding[] {
  return holdings
    .filter((h) => h.ticker)
    .map((h) => {
      const market = marketForTicker(h.ticker, bot);
      return {
        ticker: h.ticker,
        name: h.name || h.ticker,
        price: Math.max(0.01, h.price || 1),
        shares: h.shares,
        purchasePrice: h.purchasePrice,
        market,
        currency: currencyForMarket(market) as CurrencyCode,
      };
    });
}

/**
 * Portfolio standings in the bot's BASE currency (NZD for Stox, USD for Koins).
 * Each holding's value is converted from its native currency (AUD for .AX,
 * USD for US listings / crypto, NZD for .NZ) into the base using the FX table.
 */
function computePortfolio(
  bot: BotKind,
  holdings: AnalyzableHolding[],
  fxToNZD: FxRatesToNZD
): ApexReport["portfolio"] | undefined {
  const base = baseCurrencyForBot(bot);
  const priced = holdings.filter((h) => h.shares && h.price);
  if (!priced.length) return undefined;

  let value = 0;
  let cost = 0;
  for (const h of priced) {
    const shares = h.shares || 0;
    const nativeValue = shares * (h.price || 0);
    const nativeCost = shares * (h.purchasePrice || h.price || 0);
    value += convertCurrency(nativeValue, h.currency, base, fxToNZD);
    cost += convertCurrency(nativeCost, h.currency, base, fxToNZD);
  }
  const pnl = value - cost;
  return {
    value: round(value),
    pnl: round(pnl),
    pnlPct: cost > 0 ? round((pnl / cost) * 100, 2) : 0,
    currency: base,
  };
}

/** Marketing demo — realistic but illustrative data for unsubscribed visitors. */
export function buildDemoReport(bot: BotKind): ApexReport {
  const universe = bot === "crypto" ? DEMO_CRYPTO : DEMO_STOCKS;
  const priceFor = (ticker: string) => {
    if (bot === "crypto") return CRYPTO_DIRECTORY.find((c) => c.ticker === ticker)?.price ?? 100;
    // stable pseudo price for demo stocks
    const rnd = mulberry32(hashSeed("price" + ticker));
    return round(1.5 + rnd() * 28, 2);
  };
  const tickers = universe.map((u) => synthesizeTicker(u.ticker, u.name, priceFor(u.ticker), bot, "demo-v1"));

  // Treat the demo universe as pseudo-holdings so the sample report shows the
  // full recommendation + pathway experience a subscriber receives.
  const demoHoldings: AnalyzableHolding[] = universe.map((u) => {
    const market = marketForTicker(u.ticker, bot);
    const price = priceFor(u.ticker);
    const rnd = mulberry32(hashSeed("demo-hold" + u.ticker));
    const shares = bot === "crypto" ? round(0.2 + rnd() * 4, 2) : Math.round(20 + rnd() * 180);
    return {
      ticker: u.ticker,
      name: u.name,
      price,
      shares,
      purchasePrice: round(price * (0.82 + rnd() * 0.3), price < 5 ? 4 : 2),
      market,
      currency: currencyForMarket(market) as CurrencyCode,
    };
  });

  const directRecommendations = buildDirectRecommendations(demoHoldings, bot);
  const pathwayPlan = buildPathwayPlan(demoHoldings, directRecommendations, bot);
  const portfolio = computePortfolio(bot, demoHoldings, BASELINE_FX_TO_NZD);

  return assembleReport(bot, tickers, true, { portfolio, directRecommendations, pathwayPlan });
}

export interface LiveHolding {
  ticker: string;
  name?: string;
  price: number;
  shares?: number;
  purchasePrice?: number;
}

export interface BuildLiveReportOptions {
  seedSalt?: string;
  /** Live FX rates (1 unit → NZD). Falls back to the baseline table. */
  fxToNZD?: FxRatesToNZD;
  /**
   * Live prices for the whole market universe (internal ticker → price). When
   * supplied, the report's Top-Movers and 7-day projection boards are built from
   * genuine live quotes AND automatically exclude any delisted/renamed name that
   * no longer returns a live price. Omit for the deterministic engine.
   */
  marketOverrides?: Record<string, number>;
  /**
   * Pre-computed full-market technical intel for the WHOLE addressable universe
   * of this bot's asset class. When supplied it becomes the single source of
   * truth for the report's Top-Movers, 7-day projection board AND buy
   * candidates — replacing the deterministic core universe. Koins passes the
   * COMPLETE live crypto market here so the report covers the entire
   * cryptocurrency market and never mixes in NZX / ASX / NASDAQ / DOW data.
   */
  universeIntel?: SecurityIntel[];
  /**
   * Live technicals for the held book. When present, cards, momentum counts,
   * and recommendations all use this intel instead of a seeded ticker synthesis.
   */
  holdingIntel?: SecurityIntel[];
  /** Book-level tape (bias / conviction / score) for cash-deployment guardrails. */
  tape?: TapeRead;
  /** Member ledger cash (NZD) — when present, BUY lists emphasise deploying dry powder. */
  cashBalanceNZD?: number;
}

/** Live subscriber report built from the user's real monitored holdings. */
export function buildLiveReport(
  bot: BotKind,
  holdings: LiveHolding[],
  options: BuildLiveReportOptions = {}
): ApexReport {
  const {
    seedSalt = "live",
    fxToNZD = BASELINE_FX_TO_NZD,
    marketOverrides,
    universeIntel,
    holdingIntel,
    tape,
    cashBalanceNZD = 0,
  } = options;

  const intelByTicker = new Map((holdingIntel ?? []).map((i) => [i.ticker.toUpperCase(), i]));
  const tickers = holdings
    .filter((h) => h.ticker)
    .map((h) => {
      const intel = intelByTicker.get(h.ticker.toUpperCase());
      if (intel) return tickerFromIntel(intel, bot);
      return synthesizeTicker(h.ticker, h.name || h.ticker, Math.max(0.01, h.price || 1), bot, seedSalt);
    });

  const analyzable = toAnalyzable(bot, holdings);
  const portfolio = computePortfolio(bot, analyzable, fxToNZD);
  const bookValue = (portfolio?.value || 0) + Math.max(0, cashBalanceNZD);
  const cashHeavy =
    analyzable.length === 0 ||
    (cashBalanceNZD > 0 && bookValue > 0 && cashBalanceNZD / bookValue >= 0.4);
  const guard = tape ? deploymentGuard(bot, tape, cashBalanceNZD) : undefined;
  const skippedNames: string[] = [];
  const directRecommendations = buildDirectRecommendations(analyzable, bot, universeIntel, {
    cashBalanceNZD,
    cashHeavy,
    holdingIntel,
    tape,
    skippedNames,
  });
  const pathwayPlan = buildPathwayPlan(analyzable, directRecommendations, bot, holdingIntel, guard);
  const bookRoster = analyzable
    .map((h) => `${h.ticker} × ${typeof h.shares === "number" ? h.shares : 0}`)
    .join(", ");

  return assembleReport(
    bot,
    tickers,
    false,
    {
      portfolio,
      directRecommendations,
      pathwayPlan,
      bookRoster,
      tape,
      guard,
      skippedSpeculative: skippedNames,
    },
    marketOverrides,
    universeIntel
  );
}
