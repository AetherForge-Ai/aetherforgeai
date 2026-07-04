import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { referencePrice, simulateTick } from "@/lib/market";
import { buildLiveReport, type LiveHolding, type BotKind } from "@/lib/apex";
import { renderReportHtml, type ReportAlert } from "@/lib/report-html";
import { createGrokChatCompletion, isGrokConfigured } from "@/lib/grok";
import { analyzeSecurity, type SecurityIntel } from "@/lib/market-intel";
import { computePortfolioMetrics, buildActionableIntelligence } from "@/lib/analytics";
import { fetchLiveQuotes, isLiveDataConfigured } from "@/lib/market-data";
import type { Stock } from "@/lib/portfolio";

const schema = z.object({ bot: z.enum(["stock", "crypto"]) });

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
 * POST /api/reports
 * Generates a full SuperGrok 4.3 ULTRA ADVANCED report for the logged-in user's
 * holdings, renders it to PDF, emails it to the user (with the PDF attached),
 * persists it to the `report` table and returns it for inline dashboard display.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }
    const bot: BotKind = parsed.data.bot;

    // Access gate — active subscription (free tier counts) + bot entitlement.
    if (isStripeConfigured()) {
      if (!hasActiveSubscription(user)) {
        return NextResponse.json(
          { ok: false, error: "An active plan is required to run a report. Start the free trial to unlock it." },
          { status: 403 }
        );
      }
      const access = user.bot_access ?? "none";
      if (!(access === "both" || access === bot)) {
        return NextResponse.json(
          { ok: false, error: `Your plan does not include the ${bot} monitor. Upgrade to unlock it.` },
          { status: 403 }
        );
      }
    }

    // Load holdings for this asset class (legacy rows without asset_type = stock).
    const result = await totalumSdk.crud.query("stock", { _filter: { user: user._id }, _limit: 500 });
    const allRows = (result?.data as any[]) || [];
    const rows = allRows.filter((r) => (r.asset_type || "stock") === bot);

    const limit = user.ticker_limit && user.ticker_limit > 0 ? user.ticker_limit : rows.length;
    const scoped = rows.slice(0, limit);

    // Live quotes when a market-data key is configured; falls back to simulation.
    const live = isLiveDataConfigured()
      ? await fetchLiveQuotes(scoped.map((r) => String(r.ticker)))
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

    const report = buildLiveReport(bot, holdings, `${user._id}:${bot}:${Date.now()}`);

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
          console.log(`[api/reports] Grok narrative applied for user ${user._id}`);
        }
      } catch (grokErr) {
        console.error("[api/reports] Grok enhancement failed (non-fatal):", grokErr);
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
      console.error("[api/reports] Failed to load alerts (non-fatal):", alertErr);
    }

    const now = new Date();
    const generatedAtLabel = nzDateLabel(now);
    const html = renderReportHtml(report, {
      userName: user.name,
      generatedAtLabel,
      alerts,
      aiEnhanced,
      technicals,
      metrics,
      intelligence,
    });
    console.log(`[api/reports] Report built for user ${user._id} (pricing: ${usedLive ? "live" : "simulated"})`);

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
      console.log(`[api/reports] PDF generated for user ${user._id}: ${pdfFileName}`);
    } catch (pdfErr) {
      console.error("[api/reports] PDF generation failed:", pdfErr);
    }

    // Email the report (HTML body + PDF attachment).
    let emailed = false;
    try {
      await totalumSdk.email.sendEmail({
        to: [user.email],
        subject: `${report.title} — ${generatedAtLabel}`,
        html,
        fromName: "AetherForge AI",
        ...(pdfUrl
          ? { attachments: [{ filename: `${report.title}.pdf`, url: pdfUrl, contentType: "application/pdf" }] }
          : {}),
      });
      emailed = true;
      console.log(`[api/reports] Report emailed to ${user.email}`);
    } catch (mailErr) {
      console.error("[api/reports] Email delivery failed (non-fatal):", mailErr);
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
        ...(pdfFileName ? { pdf_file: { name: pdfFileName } } : {}),
      });
      reportId = (saved?.data as any)?._id ?? null;
      console.log(`[api/reports] Saved report ${reportId} for user ${user._id}`);
    } catch (saveErr) {
      console.error("[api/reports] Failed to persist report (non-fatal):", saveErr);
    }

    return NextResponse.json({
      ok: true,
      data: { report, pdfUrl, reportId, emailed, aiEnhanced, monitored: holdings.length, generatedAtLabel },
    });
  } catch (err: any) {
    console.error("[api/reports] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to generate report" }, { status: 500 });
  }
}

/** GET /api/reports — list the user's past reports (most recent first). */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const res = await totalumSdk.crud.query("report", {
      _filter: { user: user._id },
      _sort: { createdAt: "desc" },
      _limit: 50,
    });
    const rows = (res?.data as any[]) || [];
    const reports = rows.map((r) => ({
      _id: r._id,
      title: r.title,
      bot: r.bot,
      marketLabel: r.market_label,
      executiveSummary: r.executive_summary,
      emailed: r.emailed,
      aiEnhanced: r.ai_enhanced === "yes",
      generatedAt: r.generated_at || r.createdAt,
      pdfUrl: r.pdf_file?.url ?? null,
    }));

    console.log(`[api/reports] GET returned ${reports.length} reports for user ${user._id}`);
    return NextResponse.json({ ok: true, data: reports });
  } catch (err: any) {
    console.error("[api/reports] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load reports" }, { status: 500 });
  }
}
