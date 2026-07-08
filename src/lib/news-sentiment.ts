import "server-only";
import { totalumSdk } from "@/lib/totalum";

/**
 * Headline sentiment scoring.
 *
 * Upgrades the bot's news read from crude keyword matching to a proper
 * finance-aware sentiment model using Totalum's built-in OpenAI (no user key
 * required). It is fully non-fatal: on any error, or when the model is
 * unavailable, it transparently falls back to the deterministic keyword
 * classifier so the bot is never worse than before.
 */

export type Sentiment = "Bullish" | "Bearish" | "Neutral";

export interface HeadlineInput {
  headline: string;
  source?: string;
}

export interface ScoredHeadline {
  headline: string;
  source?: string;
  sentiment: Sentiment;
  score: number; // -100 (max bearish) … +100 (max bullish)
}

export interface SentimentSummary {
  label: Sentiment; // net directional read across the batch
  score: number; // 0-100 (50 = neutral) aggregate sentiment index
  bullish: number;
  bearish: number;
  neutral: number;
  method: "ai" | "keyword"; // which engine produced the scores
  headlines: ScoredHeadline[];
}

const BULLISH_WORDS =
  /surge|soar|rally|jump|gain|record|inflow|approv|adopt|bull|breakout|upgrade|partnership|integrat|all-time high|\bath\b|beat|tops|dovish|stimulus|recover|strong|expand|lift|firm|optimis/i;
const BEARISH_WORDS =
  /crash|plunge|drop|fall|slump|hack|exploit|lawsuit|\bban\b|selloff|outflow|liquidat|bear|downgrade|fraud|warn|miss|cut|hawkish|recession|slow|weak|pressure|concern|default|probe/i;

/** Deterministic keyword classifier — the always-available fallback. */
export function keywordSentiment(headline: string): { sentiment: Sentiment; score: number } {
  const bull = BULLISH_WORDS.test(headline);
  const bear = BEARISH_WORDS.test(headline);
  if (bull && !bear) return { sentiment: "Bullish", score: 45 };
  if (bear && !bull) return { sentiment: "Bearish", score: -45 };
  return { sentiment: "Neutral", score: 0 };
}

function summarise(scored: ScoredHeadline[], method: "ai" | "keyword"): SentimentSummary {
  const bullish = scored.filter((s) => s.sentiment === "Bullish").length;
  const bearish = scored.filter((s) => s.sentiment === "Bearish").length;
  const neutral = scored.filter((s) => s.sentiment === "Neutral").length;
  const avg = scored.length ? scored.reduce((s, h) => s + h.score, 0) / scored.length : 0;
  // Map −100..+100 → 0..100 (50 = neutral).
  const index = Math.round(Math.max(0, Math.min(100, 50 + avg / 2)));
  const label: Sentiment = index >= 58 ? "Bullish" : index <= 42 ? "Bearish" : "Neutral";
  return { label, score: index, bullish, bearish, neutral, method, headlines: scored };
}

function keywordScoreAll(items: HeadlineInput[]): SentimentSummary {
  const scored = items.map((it) => {
    const { sentiment, score } = keywordSentiment(it.headline);
    return { headline: it.headline, source: it.source, sentiment, score };
  });
  return summarise(scored, "keyword");
}

/**
 * Score a batch of headlines. Attempts one batched call to the built-in OpenAI
 * model (finance-tuned prompt, JSON out); on any failure returns the keyword
 * summary. `assetLabel` frames the model (e.g. "New Zealand & Australian
 * equities" or "cryptocurrencies").
 */
export async function scoreHeadlines(
  items: HeadlineInput[],
  assetLabel: string
): Promise<SentimentSummary> {
  const clean = items.filter((i) => i.headline && i.headline.trim().length > 3).slice(0, 24);
  if (!clean.length) return summarise([], "keyword");

  try {
    const numbered = clean.map((it, i) => `${i + 1}. ${it.headline}`).join("\n");
    const chatBody = {
      messages: [
        {
          role: "system",
          content:
            "You are a financial-markets sentiment analyst. Classify each news headline for its likely short-term price impact " +
            `on ${assetLabel}. Respond with ONLY a JSON array (no prose), one object per headline, in order: ` +
            `[{"i":1,"sentiment":"Bullish|Bearish|Neutral","score":<integer -100..100>}]. ` +
            "Positive score = bullish, negative = bearish, 0 = neutral. Judge market impact, not tone.",
        },
        { role: "user", content: numbered },
      ],
      model: "gpt-4.1-mini",
      max_tokens: 900,
      temperature: 0.1,
    };
    const result = await totalumSdk.openai.createChatCompletion(chatBody);
    const raw = (result?.data as any)?.choices?.[0]?.message?.content ?? "";
    const jsonText = String(raw).replace(/```json/gi, "").replace(/```/g, "").trim();
    const start = jsonText.indexOf("[");
    const end = jsonText.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("No JSON array in model output");
    const parsed = JSON.parse(jsonText.slice(start, end + 1)) as { i: number; sentiment: string; score: number }[];

    const byIndex = new Map<number, { sentiment: string; score: number }>();
    for (const p of parsed) if (typeof p.i === "number") byIndex.set(p.i, p);

    const scored: ScoredHeadline[] = clean.map((it, idx) => {
      const p = byIndex.get(idx + 1);
      let sentiment: Sentiment = "Neutral";
      let score = 0;
      if (p) {
        const s = String(p.sentiment || "").toLowerCase();
        sentiment = s.startsWith("bull") ? "Bullish" : s.startsWith("bear") ? "Bearish" : "Neutral";
        score = Math.max(-100, Math.min(100, Math.round(Number(p.score) || 0)));
      } else {
        const kw = keywordSentiment(it.headline);
        sentiment = kw.sentiment;
        score = kw.score;
      }
      return { headline: it.headline, source: it.source, sentiment, score };
    });
    console.log(`[news-sentiment] Scored ${scored.length} headlines via built-in OpenAI (${assetLabel}).`);
    return summarise(scored, "ai");
  } catch (err) {
    console.error("[news-sentiment] AI scoring failed — falling back to keyword classifier:", err);
    return keywordScoreAll(clean);
  }
}
