import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { referencePrice, simulateTick } from "@/lib/market";
import { buildLiveReport, type LiveHolding, type BotKind } from "@/lib/apex";
import { renderReportHtml, type ReportAlert } from "@/lib/report-html";
import { createZenithCompletion, isZenithConfigured } from "@/lib/grok";
import { analyzeSecurity, getMarketNews, type SecurityIntel } from "@/lib/market-intel";
import { computePortfolioMetrics, buildActionableIntelligence } from "@/lib/analytics";
import { getUpcomingEvents } from "@/lib/econ-calendar";
import { scoreHeadlines } from "@/lib/news-sentiment";
import { buildIntelligenceBriefing } from "@/lib/briefing";
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

  // ---- Intelligence briefing + probabilistic 7-day outlook -------------
  // Scheduled macro catalysts for the next 7 days (deterministic, no key).
  const econEvents = getUpcomingEvents(bot);
  // News-sentiment read — built-in OpenAI with keyword fallback (non-fatal;
  // scoreHeadlines never throws, it degrades to the keyword classifier).
  const newsAssetLabel = bot === "crypto" ? "cryptocurrencies" : "New Zealand & Australian equities";
  const headlines = getMarketNews(bot)
    .slice(0, 16)
    .map((nws) => ({ headline: nws.headline, source: nws.source }));
  const sentiment = await scoreHeadlines(headlines, newsAssetLabel);
  const briefing = buildIntelligenceBriefing({
    bot,
    marketLabel: report.marketLabel,
    technicals,
    events: econEvents,
    sentiment,
  });
  console.log(
    `[report-service] Briefing assembled for user ${user._id}: ${briefing.outlook.length} outlook rows, ` +
      `${econEvents.length} catalysts, sentiment ${sentiment.label} (${sentiment.method}), overall ${briefing.overall.level}/${briefing.overall.bias}`
  );
  report.briefing = briefing;

  // SuperGrok 4.3 · Ultra Advanced ZENITH State narrative — every bot's report is
  // authored in this state whenever the owner's Grok key is configured. Non-fatal:
  // if Grok is unavailable the report still ships with its deterministic summary.
  const botLabel = bot === "crypto" ? "Koins (crypto)" : "Stox (equities)";
  let aiEnhanced = false;
  if (isZenithConfigured() && holdings.length) {
    try {
      const lines = holdings
        .map((h, i) => {
          const t = technicals[i];
          if (!t) return `${h.ticker}: $${h.price.toFixed(2)} — no technical read`;
          const base = `${t.outlook.base.lowPct >= 0 ? "+" : ""}${t.outlook.base.lowPct}% to ${t.outlook.base.highPct >= 0 ? "+" : ""}${t.outlook.base.highPct}%`;
          return (
            `${h.ticker}: $${h.price.toFixed(2)} (held ${h.shares}, cost $${(h.purchasePrice || 0).toFixed(2)}) — ` +
            `signal ${t.signal}, ${t.conviction} conviction, regime ${t.regime}, RSI ${t.rsi}, MACD ${t.macdSignal}, ` +
            `7d base-case range ${base} (${t.outlook.base.probability}% odds) @ ${t.confidence}% confidence`
          );
        })
        .join("\n");
      const sells = intelligence.sellRecommendations.map((r) => r.ticker).join(", ") || "none";
      const buys = intelligence.buyCandidates.map((b) => b.ticker).join(", ") || "none";
      const catalystLine = econEvents.length
        ? econEvents.map((e) => `${e.title} (${e.dateLabel})`).join("; ")
        : "no top-tier scheduled catalysts";
      console.log(`[report-service] Running ${report.engine} narrative for ${botLabel} · user ${user._id}`);
      const narrative = await createZenithCompletion({
        maxTokens: 1100,
        messages: [
          {
            role: "user",
            content:
              `You are the ${botLabel} bot producing this member's report in ULTRA ADVANCED ZENITH STATE. ` +
              `Write a rich, professional 3-5 sentence executive summary of the portfolio's short-term (7-day) outlook. ` +
              `Be strictly evidence-based and PROBABILISTIC — speak in expected ranges and likelihoods, and NEVER give a single-point price target. ` +
              `Reference the technical posture (RSI/MACD/regime), overall conviction, the week's catalysts, news sentiment, and the single most important action to take now. ` +
              `Close by stating this is informational intelligence, not financial advice. Use **bold** for the highest-signal phrases.\n\n` +
              `Market: ${report.marketLabel}.\n` +
              `Overall read: ${briefing.overall.bias} bias, ${briefing.overall.level} conviction, net ${briefing.overall.score}/100.\n` +
              `News sentiment: ${sentiment.label} (${sentiment.score}/100, ${sentiment.method} model).\n` +
              `Catalysts next 7 days: ${catalystLine}.\n` +
              `Portfolio metrics: health ${metrics.healthScore}/100 (${metrics.healthLabel}), annualised volatility ${metrics.volatility}%, Sharpe ${metrics.sharpe}, 7-day alpha potential ${metrics.alphaPotentialPct}%.\n` +
              `SELL flags: ${sells}. High-conviction BUY candidates: ${buys}.\n` +
              `Holdings:\n${lines}\n\nWrite the ZENITH executive summary now.`,
          },
        ],
      });
      if (narrative && narrative.length > 40) {
        report.executiveSummary = narrative;
        // Keep the briefing's headline summary in lock-step with the report.
        briefing.executiveSummary = narrative;
        briefing.aiSummary = true;
        aiEnhanced = true;
        console.log(`[report-service] ZENITH narrative applied for user ${user._id}`);
      }
    } catch (grokErr) {
      console.error("[report-service] ZENITH narrative failed (non-fatal):", grokErr);
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
    engine: report.engine,
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
      ai_engine: report.engine,
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
