import "server-only";
import { computeSummary, formatCurrency, formatPercent, type Stock } from "@/lib/portfolio";

/**
 * Builds a compact, information-dense text description of a user's portfolio
 * for feeding into the AI as grounding context.
 */
export function buildPortfolioContext(stocks: Stock[]): string {
  if (!stocks || stocks.length === 0) {
    return "The user's portfolio is currently empty. They have not added any holdings yet.";
  }

  const s = computeSummary(stocks);
  const lines: string[] = [];

  lines.push(
    `PORTFOLIO SUMMARY (${s.holdingsCount} holdings):`,
    `- Total market value: ${formatCurrency(s.totalValue)}`,
    `- Total cost basis: ${formatCurrency(s.totalCost)}`,
    `- Total unrealized P/L: ${formatCurrency(s.totalGain)} (${formatPercent(s.totalGainPct)})`
  );

  if (s.bestPerformer) {
    lines.push(
      `- Best performer: ${s.bestPerformer.ticker} (${formatPercent(s.bestPerformer.gainPct)})`
    );
  }
  if (s.worstPerformer) {
    lines.push(
      `- Worst performer: ${s.worstPerformer.ticker} (${formatPercent(s.worstPerformer.gainPct)})`
    );
  }

  lines.push("", "SECTOR ALLOCATION:");
  s.sectorAllocation.forEach((sec) => {
    lines.push(`- ${sec.sector}: ${sec.weight.toFixed(1)}% (${formatCurrency(sec.value)})`);
  });

  lines.push("", "HOLDINGS DETAIL:");
  s.holdings.forEach((h) => {
    lines.push(
      `- ${h.ticker} (${h.company_name || h.ticker}) | ${h.sector || "Other"} | ` +
        `${h.shares} shares @ avg ${formatCurrency(h.purchase_price)}, now ${formatCurrency(
          h.current_price
        )} | value ${formatCurrency(h.marketValue)} | P/L ${formatPercent(h.gainPct)} | ` +
        `weight ${h.weight.toFixed(1)}%`
    );
  });

  return lines.join("\n");
}

export const ANALYST_SYSTEM_PROMPT = `You are "AetherForge", a sharp, professional equity research analyst inside the AetherForge AI market-analysis app.
You speak concisely and with authority, like a buy-side analyst briefing a client.
Ground every statement in the portfolio data provided. Use concrete numbers from the context.
When discussing risk, mention concentration, sector tilt, and diversification.
You may reference general, well-known market dynamics, but never invent specific real-time prices or news you do not have.
Always include a brief, non-legalese disclaimer that this is not personalized financial advice.
Format responses in clean Markdown with short paragraphs, bold key figures, and bullet lists where useful.`;
