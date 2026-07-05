import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { referencePrice, simulateTick } from "@/lib/market";
import { buildLiveReport, type LiveHolding, type BotKind } from "@/lib/apex";
import { renderReportHtml, type ReportAlert } from "@/lib/report-html";
import { createGrokChatCompletion, isGrokConfigured } from "@/lib/grok";
import { analyzeSecurity, type SecurityIntel } from "@/lib/market-intel";
import { computePortfolioMetrics, buildActionableIntelligence } from "@/lib/analytics";
import { fetchQuotesForAssetClass, isLiveConfiguredFor } from "@/lib/market-data";
import { getFxSnapshot } from "@/lib/fx";
import type { Stock } from "@/lib/portfolio";

/**
 * Minimal shape of the user needed to build + deliver a report. Both the
 * dashboard "Run report" route and the Monday-9am cron job pass this.
 */
export interface ReportRecipient {
  _id: string;
  name?: string | null;
  email: string;
  ticker_limit?: number | null;
}

export interface GeneratedReport {
  report: ReturnType<typeof buildLiveReport>;
  pdfUrl: string | null;
  reportId: string | null;
  emailed: boolean;
  aiEnhanced: boolean;
  monitored: number;
  generatedAtLabel: string;
}

function nzDateLabel(d: Date): string {
  return d.toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Builds a full SuperGrok 4.3 ULTRA ADVANCED report from the user's holdings for
 * one asset class, renders a PDF, emails it (PDF attached), persists a `report`
 * record and returns everything for inline display. Shared by:
 *  - POST /api/reports (manual, dashboard-triggered)
 *  - GET  /api/cron/reports (scheduled 9am briefings)
 *
 * `context` is a short tag used to vary the report seed + email subject
 * (e.g. "manual" | "scheduled").
 */
export async function generateReportForUser(
  user: ReportRecipient,
  bot: BotKind,
  context: "manual" | "scheduled" = "manual"
): Promise<GeneratedReport> {
  // Load holdings for this asset class (legacy rows without asset_type = stock).
  const result = await totalumSdk.crud.query("stock", { _filter: { user: user._id }, _limit: 500 });
  const allRows = (result?.data as any[]) || [];
  const rows = allRows.filter((r) => (r.asset_type || "stock") === bot);

  const limit = user.ticker_limit && user.ticker_limit > 0 ? user.ticker_limit : rows.length;
  const scoped = rows.slice(0, limit);

  // Live quotes for this asset class — stocks via Twelve Data (needs a key),
  // crypto via CoinGecko (no key). Falls back to simulation on any miss.
  const live = isLiveConfiguredFor(bot)
    ? await fetchQuotesForAssetClass(scoped.map((r) => String(r.ticker)), bot)
    : {};
  const usedLive = Object.keys(live).length > 0;

  const priceFor = (r: any): number => {
    const q = live[String(r.ticker).toUpperCase()];
    if (q?.price) return q.price;
    const ref = referencePrice(r.ticker, Number(r.current_price) || Number(r.purchase_price) || 1);
    return simulateTick(ref);
  };

  const holdings: LiveHolding[] = scoped.map((r) => {
    const price = priceFor(r);
    return {
      ticker: r.ticker,
      name: r.company_name || r.ticker,
      price,
      shares: Number(r.shares) || 0,
      purchasePrice: Number(r.purchase_price) || price,
    };
  });

  // Stock[] view (live-priced) for the technical + actionable-intelligence layer.
  const stockObjs: Stock[] = scoped.map((r, i) => ({
    _id: String(r._id ?? i),
    ticker: r.ticker,
    asset_type: (r.asset_type || "stock") as "stock" | "crypto",
    company_name: r.company_name || r.ticker,
    sector: r.sector || undefined,
    shares: Number(r.shares) || 0,
    purchase_price: Number(r.purchase_price) || 0,
    current_price: holdings[i]?.price ?? (Number(r.current_price) || 0),
  }));

  const technicals: SecurityIntel[] = stockObjs.map((s) =>
    analyzeSecurity(s.ticker, s.current_price || undefined, s.company_name)
  );
  const metrics = computePortfolioMetrics(stockObjs);
  const intelligence = buildActionableIntelligence(stockObjs);

  // FX rates so AUD (.AX) / USD holdings convert into the Stox NZD total.
  const fx = await getFxSnapshot();
  console.log(
    `[report-service] FX for report (${fx.live ? "live" : "baseline"}): 1 AUD=${fx.ratesToNZD.AUD.toFixed(3)} NZD, 1 USD=${fx.ratesToNZD.USD.toFixed(3)} NZD`
  );

  const report = buildLiveReport(bot, holdings, {
    seedSalt: `${user._id}:${bot}:${context}:${Date.now()}`,
    fxToNZD: fx.ratesToNZD,
  });

  // Optional Grok narrative enhancement — never fatal.
  let aiEnhanced = false;
  if (isGrokConfigured() && holdings.length) {
    try {
      const lines = holdings
        .map((h, i) => {
          const t = technicals[i];
          return `${h.ticker}: $${h.price.toFixed(2)} (held ${h.shares}, cost $${(h.purchasePrice || 0).toFixed(2)}) — signal ${t?.signal ?? "n/a"}, RSI ${t?.rsi ?? "n/a"}, MACD ${t?.macdSignal ?? "n/a"}, 7d proj ${t ? (t.projected7dPct >= 0 ? "+" : "") + t.projected7dPct + "%" : "n/a"} @ ${t?.confidence ?? "n/a"}% conf`;
        })
        .join("\n");
      const sells = intelligence.sellRecommendations.map((r) => r.ticker).join(", ") || "none";
      const buys = intelligence.buyCandidates.map((b) => b.ticker).join(", ") || "none";
      const narrative = await createGrokChatCompletion({
        maxTokens: 900,
        temperature: 0.6,
        messages: [
          {
            role: "system",
            content:
              "You are AetherForge, an elite institutional market-intelligence analyst. Write a rich, professional 4-6 sentence executive summary of a portfolio's short-term (7-day) outlook. Reference the technical posture (RSI/MACD/projection), overall portfolio health, and the single most important action. Use **bold** for key phrases. End with a one-line italic (_..._) disclaimer that this is informational only, not financial advice.",
          },
          {
            role: "user",
            content: `Market: ${report.marketLabel}.\nPortfolio metrics: health ${metrics.healthScore}/100 (${metrics.healthLabel}), annualised volatility ${metrics.volatility}%, Sharpe ${metrics.sharpe}, 7-day alpha potential ${metrics.alphaPotentialPct}%.\nSELL flags: ${sells}. High-conviction BUY candidates: ${buys}.\nHoldings:\n${lines}\n\nWrite the executive summary now.`,
          },
        ],
      });
      if (narrative && narrative.length > 40) {
        report.executiveSummary = narrative;
        aiEnhanced = true;
        console.log(`[report-service] Grok narrative applied for user ${user._id}`);
      }
    } catch (grokErr) {
      console.error("[report-service] Grok enhancement failed (non-fatal):", grokErr);
    }
  }

  // Pull the user's price alerts for these tickers to include an action plan.
  let alerts: ReportAlert[] = [];
  try {
    const alertRes = await totalumSdk.crud.query("price_alert", { _filter: { user: user._id }, _limit: 200 });
    const tickerSet = new Set(scoped.map((r) => r.ticker));
    alerts = ((alertRes?.data as any[]) || [])
      .filter((a) => tickerSet.has(a.ticker))
      .map((a) => ({
        ticker: a.ticker,
        currentPrice: referencePrice(a.ticker, Number(a.hard_sell_price) || 1),
        trimPct: a.trim_pct ?? null,
        trimTriggerDipPct: a.trim_trigger_dip_pct ?? null,
        hardSellPrice: a.hard_sell_price ?? null,
        takeProfitMinPct: a.take_profit_min_pct ?? null,
        takeProfitMaxPct: a.take_profit_max_pct ?? null,
        instructions: a.instructions ?? null,
        status: a.status ?? null,
      }));
  } catch (alertErr) {
    console.error("[report-service] Failed to load alerts (non-fatal):", alertErr);
  }

  const now = new Date();
  const generatedAtLabel = nzDateLabel(now);
  const html = renderReportHtml(report, {
    userName: user.name || undefined,
    generatedAtLabel,
    alerts,
    aiEnhanced,
    technicals,
    metrics,
    intelligence,
  });
  console.log(
    `[report-service] Report built for user ${user._id} (${context}, pricing: ${usedLive ? "live" : "simulated"})`
  );

  // Render the PDF.
  let pdfFileName: string | null = null;
  let pdfUrl: string | null = null;
  try {
    const pdf = await totalumSdk.files.createPdfFromHtml({
      html,
      name: `AetherForge-${bot}-report-${now.getTime()}.pdf`,
    });
    pdfFileName = (pdf?.data as any)?.fileName ?? null;
    pdfUrl = (pdf?.data as any)?.url ?? null;
    console.log(`[report-service] PDF generated for user ${user._id}: ${pdfFileName}`);
  } catch (pdfErr) {
    console.error("[report-service] PDF generation failed:", pdfErr);
  }

  // Email the report (HTML body + PDF attachment).
  const subjectPrefix = context === "scheduled" ? "Your scheduled briefing · " : "";
  let emailed = false;
  try {
    await totalumSdk.email.sendEmail({
      to: [user.email],
      subject: `${subjectPrefix}${report.title} — ${generatedAtLabel}`,
      html,
      fromName: "AetherForge AI",
      ...(pdfUrl
        ? { attachments: [{ filename: `${report.title}.pdf`, url: pdfUrl, contentType: "application/pdf" }] }
        : {}),
    });
    emailed = true;
    console.log(`[report-service] Report emailed to ${user.email}`);
  } catch (mailErr) {
    console.error("[report-service] Email delivery failed (non-fatal):", mailErr);
  }

  // Persist the report record.
  let reportId: string | null = null;
  try {
    const saved = await totalumSdk.crud.createRecord("report", {
      title: report.title,
      user: user._id,
      bot,
      market_label: report.marketLabel,
      executive_summary: report.executiveSummary,
      payload: JSON.stringify(report),
      emailed: emailed ? "yes" : "no",
      ai_enhanced: aiEnhanced ? "yes" : "no",
      generated_at: now.toISOString(),
      trigger: context,
      ...(pdfFileName ? { pdf_file: { name: pdfFileName } } : {}),
    });
    reportId = (saved?.data as any)?._id ?? null;
    console.log(`[report-service] Saved report ${reportId} for user ${user._id}`);
  } catch (saveErr) {
    console.error("[report-service] Failed to persist report (non-fatal):", saveErr);
  }

  return { report, pdfUrl, reportId, emailed, aiEnhanced, monitored: holdings.length, generatedAtLabel };
}
