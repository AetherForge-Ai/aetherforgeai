import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { buildPortfolioContext, ANALYST_SYSTEM_PROMPT } from "@/lib/ai-context";
import { createGrokChatCompletion, type GrokMessage } from "@/lib/grok";
import type { Stock } from "@/lib/portfolio";

/**
 * POST /api/analysis
 * Generates an AI-written research report for the user's current portfolio.
 */
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const result = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _limit: 500,
    });
    const stocks = ((result?.data as any[]) || []) as Stock[];

    if (stocks.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          report:
            "### No holdings yet\n\nAdd a few positions to your portfolio and I'll generate a full research report — covering performance, diversification, concentration risk, and sector positioning.",
        },
      });
    }

    const context = buildPortfolioContext(stocks);

    const messages: GrokMessage[] = [
      { role: "system", content: ANALYST_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Write a professional portfolio analysis report based on the data below.\n\n` +
          `Structure it with these Markdown sections:\n` +
          `## Executive Summary\n## Performance\n## Diversification & Concentration\n## Key Observations\n## Suggested Focus Areas\n\n` +
          `Keep it insightful and specific to the numbers. End with a one-line disclaimer.\n\n` +
          `PORTFOLIO DATA:\n${context}`,
      },
    ];

    console.log(`[api/analysis] Generating Grok report for user ${user._id} (${stocks.length} holdings)`);
    const report = await createGrokChatCompletion({
      messages,
      maxTokens: 1600,
      temperature: 0.6,
    });

    return NextResponse.json({ ok: true, data: { report } });
  } catch (err: any) {
    console.error("[api/analysis] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to generate analysis" },
      { status: 500 }
    );
  }
}
