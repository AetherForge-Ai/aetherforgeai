import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { ANALYST_SYSTEM_PROMPT } from "@/lib/ai-context";
import { createGrokChatCompletion, type GrokMessage } from "@/lib/grok";
import { fetchYahooQuote, yahooEquitySymbol } from "@/lib/yahoo-finance";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  symbol: z.string().min(1).max(24),
  name: z.string().max(120).optional(),
  question: z.string().max(500).optional(),
});

/**
 * POST /api/ticker-analysis
 *
 * The Stox / Koins AI analysis pane inside the detailed stock view. Runs a
 * single, ticker-focused completion through the SAME Grok backend that powers
 * the main AI Assistant — grounded with a fresh live quote so the take reflects
 * today's price action. Stateless (not persisted to the chat history) so it
 * never pollutes the user's main conversation with the assistant.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const { symbol, name } = parsed.data;
    const question =
      parsed.data.question?.trim() ||
      `Give me a concise professional analysis of ${name || symbol}: current momentum, key technical levels, the bull vs bear case, and what a prudent investor should watch over the next 1–2 weeks.`;

    // Fresh live quote for grounding (best-effort — analysis still runs without it).
    let liveContext = "Live quote unavailable right now.";
    try {
      const q = await fetchYahooQuote(yahooEquitySymbol(symbol));
      if (q) {
        liveContext =
          `Live quote for ${name || symbol} (${symbol}): price ${q.price} ${q.currency}, ` +
          `session change ${q.changePct.toFixed(2)}% (${q.changeAbs >= 0 ? "+" : ""}${q.changeAbs.toFixed(2)}), ` +
          `day high ${q.dayHigh ?? "n/a"}, day low ${q.dayLow ?? "n/a"}, ` +
          `52-week range ${q.fiftyTwoWeekLow ?? "n/a"}–${q.fiftyTwoWeekHigh ?? "n/a"}, ` +
          `previous close ${q.prevClose}.`;
      }
    } catch (err) {
      console.error("[api/ticker-analysis] quote grounding failed:", err);
    }

    const messages: GrokMessage[] = [
      {
        role: "system",
        content:
          `${ANALYST_SYSTEM_PROMPT}\n\n` +
          `You are analysing a SINGLE security for ${user.name}. Focus tightly on ${name || symbol} (${symbol}). ` +
          `Use this live market data to ground your answer:\n${liveContext}`,
      },
      { role: "user", content: question },
    ];

    console.log(`[api/ticker-analysis] Grok analysis for ${symbol} (user ${user._id})`);
    const reply = await createGrokChatCompletion({ messages, maxTokens: 700, temperature: 0.6 });

    return NextResponse.json({ ok: true, data: { reply } });
  } catch (err: any) {
    console.error("[api/ticker-analysis] POST error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to analyse ticker" },
      { status: 500 }
    );
  }
}
