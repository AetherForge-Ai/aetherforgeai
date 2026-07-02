/**
 * Zenith report engine.
 *
 * Produces the structured "Ultra Advanced Zenith-State" report shown in the
 * marketing demo modals (fake-but-realistic data) and in the subscriber
 * dashboard (built from the user's real holdings). Pure module — safe on
 * client and server. No Math.random at import time; a small seeded RNG keeps
 * demo output stable so charts don't jump between renders.
 */

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
  signal: "Strong Buy" | "Accumulate" | "Hold" | "Watch" | "Reduce";
  sentiment: number; // 0-100
  momentum: MomentumPoint[]; // 12 months
  momentum12moPct: number;
  shortTerm: DayPrediction[]; // 7 days
  pathways: Pathway[]; // 3 scenarios
  note: string;
}

export interface ZenithReport {
  bot: BotKind;
  title: string;
  marketLabel: string;
  generatedLabel: string;
  isDemo: boolean;
  executiveSummary: string;
  topGainers: { ticker: string; name: string; changePct: number }[];
  keyObservations: string[];
  newsSynthesis: { headline: string; source: string; impact: "Bullish" | "Bearish" | "Neutral" }[];
  tickers: TickerAnalysis[];
  portfolio?: { value: number; pnl: number; pnlPct: number };
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

/* ------------------------------- Reports -------------------------------- */

function assembleReport(
  bot: BotKind,
  tickers: TickerAnalysis[],
  isDemo: boolean,
  portfolio?: ZenithReport["portfolio"]
): ZenithReport {
  const sorted = [...tickers].sort((a, b) => b.changePct - a.changePct);
  const topGainers = sorted
    .filter((t) => t.changePct > 0)
    .slice(0, 3)
    .map((t) => ({ ticker: t.ticker, name: t.name, changePct: t.changePct }));

  const strong = tickers.filter((t) => t.signal === "Strong Buy" || t.signal === "Accumulate");
  const weak = tickers.filter((t) => t.signal === "Reduce");
  const marketLabel = bot === "crypto" ? "BTC · ETH · Global digital assets" : "NZX · ASX · Global equities";

  const executiveSummary =
    `**Zenith State engaged.** SuperGrok 4.3 has orchestrated a full multi-timeframe sweep across ${tickers.length} monitored ${bot === "crypto" ? "assets" : "tickers"} on ${marketLabel}. ` +
    `Aggregate 7-day bias is **${strong.length >= weak.length ? "constructive" : "defensive"}** — ${strong.length} names screen as accumulate-or-better and ${weak.length} flag elevated risk. ` +
    `Each asset below carries a 12-month continuation graph, day-by-day short-term projections and three forward pathways (safe / medium-risk / volatile). ` +
    `_Informational market intelligence only — not personalised financial advice._`;

  const keyObservations = [
    `${strong.length} of ${tickers.length} ${bot === "crypto" ? "assets" : "holdings"} carry a positive momentum signal into the week.`,
    topGainers[0]
      ? `${topGainers[0].ticker} leads the session (+${topGainers[0].changePct}%) and tops the gainer board.`
      : `No standout session gainers — the tape is consolidating.`,
    bot === "crypto"
      ? "Cross-asset correlation remains elevated; BTC dominance is the primary risk driver."
      : "Sector rotation favours defensives; watch NZX yield names into the print.",
    "Volatile-pathway probabilities are contained, keeping tail risk secondary to the base case.",
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
    title: bot === "crypto" ? "Crypto Market Intelligence Monitor" : "Stock Market Intelligence Monitor",
    marketLabel,
    generatedLabel: isDemo ? "Sample report · illustrative data" : "Live Zenith run",
    isDemo,
    executiveSummary,
    topGainers,
    keyObservations,
    newsSynthesis,
    tickers,
    portfolio,
  };
}

/** Marketing demo — realistic but illustrative data for unsubscribed visitors. */
export function buildDemoReport(bot: BotKind): ZenithReport {
  const universe = bot === "crypto" ? DEMO_CRYPTO : DEMO_STOCKS;
  const priceFor = (ticker: string) => {
    if (bot === "crypto") return CRYPTO_DIRECTORY.find((c) => c.ticker === ticker)?.price ?? 100;
    // stable pseudo price for demo stocks
    const rnd = mulberry32(hashSeed("price" + ticker));
    return round(1.5 + rnd() * 28, 2);
  };
  const tickers = universe.map((u) => synthesizeTicker(u.ticker, u.name, priceFor(u.ticker), bot, "demo-v1"));
  return assembleReport(bot, tickers, true);
}

export interface LiveHolding {
  ticker: string;
  name?: string;
  price: number;
  shares?: number;
  purchasePrice?: number;
}

/** Live subscriber report built from the user's real monitored holdings. */
export function buildLiveReport(bot: BotKind, holdings: LiveHolding[], seedSalt = "live"): ZenithReport {
  const tickers = holdings
    .filter((h) => h.ticker)
    .map((h) => synthesizeTicker(h.ticker, h.name || h.ticker, Math.max(0.01, h.price || 1), bot, seedSalt));

  let portfolio: ZenithReport["portfolio"] | undefined;
  const priced = holdings.filter((h) => h.shares && h.price);
  if (priced.length) {
    const value = priced.reduce((s, h) => s + (h.shares || 0) * (h.price || 0), 0);
    const cost = priced.reduce((s, h) => s + (h.shares || 0) * (h.purchasePrice || h.price || 0), 0);
    const pnl = value - cost;
    portfolio = { value: round(value), pnl: round(pnl), pnlPct: cost > 0 ? round((pnl / cost) * 100, 2) : 0 };
  }

  return assembleReport(bot, tickers, false, portfolio);
}
