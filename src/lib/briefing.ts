/**
 * Intelligence-briefing assembler.
 *
 * Turns the raw technical intelligence (SecurityIntel[]), the scheduled
 * economic calendar and the news-sentiment read into the concise, high-signal
 * briefing structure the bots deliver:
 *
 *   1. Executive Summary (2-3 sentences)
 *   2. Key Observations (technical structure, momentum, sentiment)
 *   3. Catalysts & Risks — next 7 days
 *   4. Probabilistic 7-day Outlook per ticker (Base / Bull / Bear ranges + odds)
 *   5. Overall conviction level + why
 *
 * Evidence-based and probabilistic by construction — every forward number is a
 * volatility-scaled *range* with a probability, never a single-point target.
 * This module is deterministic and synchronous; callers that have an LLM
 * available (report-service) may overwrite `executiveSummary` with a richer
 * narrative after the fact.
 */

import type { SecurityIntel, ProbabilisticOutlook, ConvictionLevel } from "@/lib/market-intel";
import type { EconEvent } from "@/lib/econ-calendar";
import type { SentimentSummary } from "@/lib/news-sentiment";
import type { BotKind } from "@/lib/apex";

export interface BriefingOutlookRow {
  ticker: string;
  name: string;
  currency: string;
  price: number;
  regime: string;
  conviction: ConvictionLevel;
  signal: SecurityIntel["signal"];
  outlook: ProbabilisticOutlook;
}

export interface OverallConviction {
  level: ConvictionLevel;
  bias: "Constructive" | "Defensive" | "Neutral";
  score: number; // 0-100 net directional confidence
  reason: string;
}

export interface IntelligenceBriefing {
  bot: BotKind;
  marketLabel: string;
  executiveSummary: string;
  keyObservations: string[];
  catalysts: EconEvent[];
  risks: string[];
  outlook: BriefingOutlookRow[];
  overall: OverallConviction;
  sentiment: SentimentSummary;
  highlights: string[];
  disclaimer: string;
  aiSummary: boolean; // true once an LLM narrative replaces the deterministic one
}

const DISCLAIMER =
  "This is evidence-based market intelligence, not financial advice. All forward figures are probabilistic ranges derived from recent volatility and prevailing regime — outcomes are uncertain and actual moves may fall outside every range shown. Not a recommendation or an offer to buy or sell. Always do your own research.";

function sp(x: number): string {
  return `${x >= 0 ? "+" : ""}${x}%`;
}

function rangeLabel(c: { lowPct: number; highPct: number }): string {
  return `${sp(c.lowPct)} to ${sp(c.highPct)}`;
}

/** Rank technicals by decision-usefulness: conviction first, then edge. */
const CONV_RANK: Record<ConvictionLevel, number> = { High: 0, Moderate: 1, Low: 2, Speculative: 3 };

export interface BuildBriefingArgs {
  bot: BotKind;
  marketLabel: string;
  technicals: SecurityIntel[];
  events: EconEvent[];
  sentiment: SentimentSummary;
  /** Optional label for the source of the securities, e.g. "your 6 holdings". */
  scopeLabel?: string;
}

export function buildIntelligenceBriefing(args: BuildBriefingArgs): IntelligenceBriefing {
  const { bot, marketLabel, technicals, events, sentiment } = args;
  const assetWord = bot === "crypto" ? "assets" : "holdings";
  const n = technicals.length;

  // ---- Aggregate directional read -------------------------------------
  const avgEdge = n ? technicals.reduce((s, t) => s + (t.score - 50), 0) / n : 0;
  const avgConfidence = n ? Math.round(technicals.reduce((s, t) => s + t.confidence, 0) / n) : 0;
  const netScore = Math.round(Math.max(0, Math.min(100, 50 + avgEdge)));
  const strong = technicals.filter((t) => t.signal === "Strong Buy" || t.signal === "Buy");
  const weak = technicals.filter((t) => t.signal === "Reduce" || t.signal === "Sell");
  const highConv = technicals.filter((t) => t.conviction === "High");
  const speculative = technicals.filter((t) => t.conviction === "Speculative");
  const hotVol = technicals.filter((t) => t.regime === "High Volatility");

  const bias: OverallConviction["bias"] =
    avgEdge > 5 ? "Constructive" : avgEdge < -5 ? "Defensive" : "Neutral";

  let overallLevel: ConvictionLevel;
  if (n && speculative.length / n >= 0.5) overallLevel = "Speculative";
  else if (n && highConv.length / n >= 0.34 && Math.abs(avgEdge) > 6) overallLevel = "High";
  else if (Math.abs(avgEdge) > 4 || (n && highConv.length >= 1)) overallLevel = "Moderate";
  else overallLevel = "Low";

  const overall: OverallConviction = {
    level: overallLevel,
    bias,
    score: netScore,
    reason:
      `${bias} bias across ${n} ${assetWord} (${strong.length} constructive, ${weak.length} elevated-risk), ` +
      `average model confidence ${avgConfidence}%.` +
      (hotVol.length ? ` ${hotVol.length} name${hotVol.length > 1 ? "s are" : " is"} in a high-volatility regime, widening ranges.` : "") +
      (sentiment.headlines.length ? ` News flow reads ${sentiment.label.toLowerCase()} (${sentiment.score}/100).` : ""),
  };

  // ---- Executive summary (deterministic; may be AI-upgraded later) -----
  const topName = [...technicals].sort((a, b) => b.score - a.score)[0];
  const worstName = [...technicals].sort((a, b) => a.score - b.score)[0];
  const bigCatalyst = events.find((e) => e.importance === "High");
  const executiveSummary =
    (n
      ? `The ${bot === "crypto" ? "Koins" : "Stox"} engine reads a **${bias.toLowerCase()}** 7-day posture across ${n} ${assetWord} ` +
        `(${strong.length} constructive vs ${weak.length} elevated-risk; net ${netScore}/100 at ${avgConfidence}% average confidence). ` +
        (topName ? `**${topName.ticker}** carries the strongest edge (${topName.signal}, ${topName.conviction.toLowerCase()} conviction)${worstName && worstName !== topName ? `, while **${worstName.ticker}** is the weakest link` : ""}. `
          : "")
      : `No ${assetWord} are currently monitored for this bot — add tickers to receive a full probabilistic briefing. `) +
    (bigCatalyst
      ? `Key catalyst this week: **${bigCatalyst.title}** (${bigCatalyst.dateLabel}). `
      : "No top-tier scheduled macro catalysts in the next 7 days. ") +
    `All forward calls below are probabilistic ranges, not point targets.`;

  // ---- Key observations (structure / momentum / sentiment) ------------
  const observations: string[] = [];
  if (n) {
    const trendingUp = technicals.filter((t) => t.regime === "Trending Up").length;
    const trendingDown = technicals.filter((t) => t.regime === "Trending Down").length;
    const ranging = technicals.filter((t) => t.regime === "Range-Bound").length;
    observations.push(
      `Structure: ${trendingUp} trending up, ${trendingDown} trending down, ${ranging} range-bound, ${hotVol.length} high-volatility.`
    );
    const bullMacd = technicals.filter((t) => t.macdSignal === "Bullish").length;
    const overbought = technicals.filter((t) => t.rsi >= 70).map((t) => t.ticker);
    const oversold = technicals.filter((t) => t.rsi <= 30).map((t) => t.ticker);
    observations.push(
      `Momentum: MACD is bullish on ${bullMacd}/${n}; ` +
        (overbought.length ? `overbought (RSI≥70): ${overbought.join(", ")}. ` : "no overbought extremes. ") +
        (oversold.length ? `Oversold (RSI≤30): ${oversold.join(", ")}.` : "")
    );
    const avgVol = Math.round((technicals.reduce((s, t) => s + t.realizedVolPct, 0) / n) * 10) / 10;
    observations.push(
      `Volatility: average annualised realised vol ${avgVol}% — 7-day 1σ swings average ±${Math.round((technicals.reduce((s, t) => s + t.outlook.sigma7Pct, 0) / n) * 10) / 10}%.`
    );
  }
  if (sentiment.headlines.length) {
    observations.push(
      `Sentiment: news flow is net ${sentiment.label.toLowerCase()} (${sentiment.score}/100 · ${sentiment.bullish} bullish / ${sentiment.bearish} bearish / ${sentiment.neutral} neutral, scored by ${sentiment.method === "ai" ? "AI" : "keyword"} model).`
    );
  }

  // ---- Catalysts & risks (next 7 days) --------------------------------
  const risks: string[] = [];
  if (hotVol.length) risks.push(`Elevated volatility in ${hotVol.map((t) => t.ticker).join(", ")} — outcome ranges are wide; size positions accordingly.`);
  if (weak.length) risks.push(`${weak.length} ${assetWord} carry a Reduce/Sell signal (${weak.map((t) => t.ticker).join(", ")}) — momentum is fading.`);
  const highEvents = events.filter((e) => e.importance === "High");
  if (highEvents.length)
    risks.push(`Event risk: ${highEvents.map((e) => `${e.title} (${e.dateLabel})`).join("; ")} can trigger sharp repricing.`);
  if (sentiment.label === "Bearish") risks.push(`News sentiment is net bearish (${sentiment.score}/100) — headline risk skews to the downside.`);
  const nearResistance = technicals.filter((t) => t.resistance > 0 && (t.resistance - t.price) / t.price < 0.02);
  if (nearResistance.length) risks.push(`${nearResistance.map((t) => t.ticker).join(", ")} trading into overhead resistance — breakout confirmation needed before adding.`);
  if (!risks.length) risks.push("No acute risks flagged this week — the tape is orderly, but always position for the unexpected.");

  // ---- Probabilistic outlook rows -------------------------------------
  const outlook: BriefingOutlookRow[] = [...technicals]
    .sort((a, b) => CONV_RANK[a.conviction] - CONV_RANK[b.conviction] || Math.abs(b.score - 50) - Math.abs(a.score - 50))
    .slice(0, 12)
    .map((t) => ({
      ticker: t.ticker,
      name: t.name,
      currency: t.currency,
      price: t.price,
      regime: t.regime,
      conviction: t.conviction,
      signal: t.signal,
      outlook: t.outlook,
    }));

  // ---- Highlights: unusual / high-conviction --------------------------
  const highlights: string[] = [];
  const topHigh = highConv.sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))[0];
  if (topHigh) {
    const c = topHigh.score >= 50 ? topHigh.outlook.bull : topHigh.outlook.bear;
    highlights.push(
      `⭐ High conviction: **${topHigh.ticker}** (${topHigh.signal}) — base case ${rangeLabel(topHigh.outlook.base)} (${topHigh.outlook.base.probability}%), ${topHigh.score >= 50 ? "bull" : "bear"} case ${rangeLabel(c)} (${c.probability}%).`
    );
  }
  for (const t of hotVol.slice(0, 2)) {
    highlights.push(`⚠️ Unusual volatility: **${t.ticker}** — 7-day 1σ swing ±${t.outlook.sigma7Pct}% (regime: High Volatility).`);
  }
  const bigMove = [...technicals].sort((a, b) => Math.abs(b.outlook.expectedPct) - Math.abs(a.outlook.expectedPct))[0];
  if (bigMove && Math.abs(bigMove.outlook.expectedPct) >= 3 && bigMove !== topHigh) {
    highlights.push(`📈 Largest projected drift: **${bigMove.ticker}** at ${sp(bigMove.outlook.expectedPct)} central estimate over 7 days.`);
  }

  return {
    bot,
    marketLabel,
    executiveSummary,
    keyObservations: observations,
    catalysts: events,
    risks,
    outlook,
    overall,
    sentiment,
    highlights,
    disclaimer: DISCLAIMER,
    aiSummary: false,
  };
}
