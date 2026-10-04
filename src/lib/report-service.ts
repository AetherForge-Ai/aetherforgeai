import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { buildLiveReport, type LiveHolding, type BotKind } from "@/lib/apex";
import { renderReportHtml, type ReportAlert } from "@/lib/report-html";
import { createZenithCompletion, isZenithConfigured } from "@/lib/grok";
import { analyzeSecurity, analyzeUniverse, getMarketNews, universeFor, type SecurityIntel } from "@/lib/market-intel";
import { loadMarketNews } from "@/lib/market-news";
import { computePortfolioMetrics, buildActionableIntelligence } from "@/lib/analytics";
import { getUpcomingEvents } from "@/lib/econ-calendar";
import { scoreHeadlines } from "@/lib/news-sentiment";
import { buildIntelligenceBriefing } from "@/lib/briefing";
import {
  deploymentGuard,
  narrativeContradictsCanonical,
  sanitizeGuardedReport,
  rateAsset,
  readTape,
  alignedProjection,
} from "@/lib/report-consistency";
import { fetchQuotesForAssetClass, isLiveConfiguredFor } from "@/lib/market-data";
import { fetchCryptoMarketIntel } from "@/lib/koins-market";
import { getFxSnapshot } from "@/lib/fx";
import type { Stock } from "@/lib/portfolio";
import { formatAucklandDateTime } from "@/lib/entitlements";
import { groundReportNarrative, ownerIdOf } from "@/lib/report-book";
import { alertIsEffectivelyArchived, heldQuantityForTicker } from "@/lib/alert-lifecycle";
import { relockSeededReportPrices } from "@/lib/paper-quote-lock.server";
import { reportEmailWasDelivered } from "@/lib/report-email";
import { loadTotalumSynthesis } from "@/lib/totalum-service";
import type { TotalumSynthesis } from "@/lib/totalum-engine";
import {
  marketFeedUnavailableLine,
  portfolioIsLoaded,
  readPortfolioBook,
  type CoveragePosition,
} from "@/lib/report-scope";
import { isBullionHolding } from "@/lib/metal-valuation";

/**
 * Minimal shape of the user needed to build + deliver a report. Both the
 * dashboard "Run report" route and the Monday-9am cron job pass this.
 */
export interface ReportRecipient {
  _id: string;
  name?: string | null;
  email: string;
  ticker_limit?: number | null;
  /** Ledger cash (NZD) — used so empty/cash-heavy books still get ticker BUY lists. */
  cash_balance?: number | null;
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

/** Raised when a bot has no positions. Nothing is saved and nothing is emailed. */
export class EmptyBookReportError extends Error {
  readonly code = "empty-book" as const;
  constructor(bot: string) {
    super(
      `No current ${bot === "crypto" ? "Koins" : "Stox"} report is issued when that book has no positions. Nothing was emailed.`
    );
    this.name = "EmptyBookReportError";
  }
}

function nzDateLabel(d: Date): string {
  return formatAucklandDateTime(d);
}

/**
 * Holdings for one account. The filtered query is the fast path (same as
 * /api/stocks). When it comes back with no row owned by this id — a missed
 * relation filter, or a page of someone else's rows — scan the recent book
 * and keep only this account. A thrown query is `bookLoaded: false` so the
 * caller does not save an empty-book report.
 */
export async function loadStockRowsForAccount(
  accountId: string
): Promise<{ rows: any[]; bookLoaded: boolean }> {
  try {
    const filtered = await totalumSdk.crud.query("stock", {
      _filter: { user: accountId },
      _sort: { createdAt: "desc" },
      _limit: 500,
    });
    const page = ((filtered as { data?: unknown[] })?.data as any[]) || [];
    const owned = page.filter((row) => ownerIdOf(row) === accountId);
    const untagged = page.filter((row) => !ownerIdOf(row));
    const foreign = page.some((row) => {
      const owner = ownerIdOf(row);
      return !!owner && owner !== accountId;
    });
    if (owned.length > 0) {
      console.log(
        `[report-service] Holdings for ${accountId}: ${owned.length} owned row(s)` +
          (foreign ? " (dropped other accounts on the same page)" : "")
      );
      return { rows: owned, bookLoaded: true };
    }
    try {
      const recent = await totalumSdk.crud.query("stock", {
        _sort: { createdAt: "desc" },
        _limit: 500,
      });
      const scanned = (((recent as { data?: unknown[] })?.data as any[]) || []).filter(
        (row) => ownerIdOf(row) === accountId
      );
      if (scanned.length > 0) {
        console.log(
          `[report-service] Filtered holdings query missed ${accountId}; recent scan found ${scanned.length}`
        );
        return { rows: scanned, bookLoaded: true };
      }
    } catch (scanErr) {
      console.error("[report-service] Recent holdings scan failed:", scanErr);
    }
    if (foreign) {
      console.error(
        `[report-service] Holdings page for ${accountId} contained other accounts and no owned rows`
      );
      return { rows: [], bookLoaded: true };
    }
    return { rows: untagged, bookLoaded: true };
  } catch (err) {
    console.error(`[report-service] Holdings load failed for ${accountId}:`, err);
    return { rows: [], bookLoaded: false };
  }
}

/**
 * Builds a full SuperGrok 4.6 ULTRA ADVANCED report from the user's holdings for
 * one asset class, renders a PDF, emails it (PDF attached), persists a `report`
 * record and returns everything for inline display. Shared by:
 *  - POST /api/reports (manual, dashboard-triggered)
 *  - GET  /api/cron/reports (scheduled 9am briefings)
 *
 * `context` is a short tag used to vary the report seed + email subject
 * (e.g. "manual" | "scheduled"). `deliver: false` still runs the full report
 * and returns it, without a PDF, an email, or a saved row.
 */
export async function generateReportForUser(
  user: ReportRecipient,
  bot: BotKind,
  context: "manual" | "scheduled" | "inline" = "manual",
  options?: { deliver?: boolean }
): Promise<GeneratedReport> {
  const deliver = options?.deliver !== false;
  // Load holdings for this asset class (legacy rows without asset_type = stock).
  // Never invent an empty book when the holdings query itself failed.
  const loaded = await loadStockRowsForAccount(user._id);
  if (!loaded.bookLoaded) {
    throw new Error("Could not load this account's live holdings, so no report was saved.");
  }
  const allRows = loaded.rows;
  const rows = allRows.filter((r) => {
    const asset = r.asset_type || "stock";
    if (asset === "metal" || isBullionHolding(r.asset_type, r.ticker, r.company_name)) return false;
    return asset === bot;
  });

  const limit = user.ticker_limit && user.ticker_limit > 0 ? user.ticker_limit : rows.length;
  const scoped = rows.slice(0, limit);

  // Live quotes for this sleeve. A missing print keeps a stored book price.
  // Nothing is simulated — a name with neither is left unpriced and said so.
  const live = scoped.length && isLiveConfiguredFor(bot)
    ? await fetchQuotesForAssetClass(scoped.map((r) => String(r.ticker)), bot)
    : {};
  const usedLive = Object.keys(live).length > 0;

  const holdings: LiveHolding[] = [];
  for (const r of scoped) {
    const ticker = String(r.ticker || "");
    if (!ticker) continue;
    const quote = live[ticker.toUpperCase()];
    const stored =
      Number(r.current_price) > 0
        ? Number(r.current_price)
        : Number(r.purchase_price) > 0
          ? Number(r.purchase_price)
          : 0;
    const price = quote?.price && quote.price > 0 ? quote.price : stored;
    if (!(price > 0)) continue;
    holdings.push({
      ticker,
      name: r.company_name || ticker,
      price,
      shares: Number(r.shares) || 0,
      purchasePrice: Number(r.purchase_price) || price,
    });
  }
  console.log(
    `[report-service] Live ${bot} book for user ${user._id}: ${
      holdings.length ? holdings.map((h) => `${h.ticker}×${h.shares}`).join(", ") : "(none)"
    }`
  );

  // Stock[] view (priced) for the technical + actionable-intelligence layer.
  const stockObjs: Stock[] = holdings.map((h, i) => ({
    _id: String(i),
    ticker: h.ticker,
    asset_type: bot,
    company_name: h.name || h.ticker,
    shares: h.shares || 0,
    purchase_price: h.purchasePrice || 0,
    current_price: h.price,
  }));

  const technicals: SecurityIntel[] = stockObjs.map((s) =>
    analyzeSecurity(s.ticker, s.current_price || undefined, s.company_name)
  );
  const metrics = computePortfolioMetrics(stockObjs);

  // FX rates so AUD (.AX) / USD holdings convert into the Stox NZD total.
  const fx = await getFxSnapshot();
  console.log(
    `[report-service] FX for report (${fx.live ? "live" : "baseline"}): 1 AUD=${fx.ratesToNZD.AUD.toFixed(3)} NZD, 1 USD=${fx.ratesToNZD.USD.toFixed(3)} NZD`
  );

  // Live prices for the WHOLE market universe so the report's Top-Movers and
  // 7-day projection boards are built from genuine live quotes — and so any
  // delisted / acquired / renamed name (no live price) is dropped automatically
  // rather than appearing on stale synthetic data.
  let marketOverrides: Record<string, number> = {};
  try {
    const universeTickers = universeFor(bot).map((e) => e.ticker);
    const universeQuotes = await fetchQuotesForAssetClass(universeTickers, bot);
    marketOverrides = Object.fromEntries(
      Object.entries(universeQuotes).map(([t, q]) => [t, q.price])
    );
    console.log(
      `[report-service] Universe live sweep: ${Object.keys(marketOverrides).length}/${universeTickers.length} ${bot} names priced live`
    );
  } catch (err) {
    console.error("[report-service] Universe live sweep failed:", err);
  }

  // Koins full-market parity: the COMPLETE live crypto market (top-500 via
  // Swyftx → CoinGecko). Stox stays on the equity universe. A dead feed is
  // not replaced with directory seed prices.
  let universeIntel: SecurityIntel[] | undefined;
  if (bot === "crypto") {
    const cryptoIntel = await fetchCryptoMarketIntel();
    if (cryptoIntel.length) {
      universeIntel = cryptoIntel;
      console.log(`[report-service] Koins full-market intel: ${cryptoIntel.length} coins feeding the report`);
    } else {
      console.error("[report-service] Koins full-market intel empty");
    }
  }

  const marketTechnicals: SecurityIntel[] = universeIntel?.length
    ? universeIntel
    : Object.keys(marketOverrides).length > 0
      ? analyzeUniverse(marketOverrides, bot)
      : [];
  const marketFeedUnavailable = marketTechnicals.length === 0;
  const partialFeedLine =
    bot === "crypto" && !universeIntel?.length && marketTechnicals.length
      ? "The full crypto-market feed is unavailable for this run."
      : "";
  if (marketFeedUnavailable) {
    console.error(`[report-service] ${bot} market feed unavailable — report will say so and will not invent quotes`);
  }
  const intelligence = buildActionableIntelligence(
    stockObjs,
    bot,
    marketTechnicals.length ? marketTechnicals : null,
    false
  );

  let synthesis: TotalumSynthesis | null = null;
  try {
    synthesis = await loadTotalumSynthesis(user._id);
  } catch (err) {
    console.error("[report-service] Live book total unavailable (cash rule falls back to this sleeve):", err);
  }

  const cashBalanceNZD =
    synthesis && synthesis.cashBalanceNZD > 0
      ? synthesis.cashBalanceNZD
      : typeof user.cash_balance === "number" && isFinite(user.cash_balance)
        ? Math.max(0, user.cash_balance)
        : 0;

  let accountBookNZD = 0;
  if (synthesis && synthesis.totalValueNZD > 0) {
    accountBookNZD = synthesis.totalValueNZD;
    if (!synthesis.metalsLive) {
      const metalValue = synthesis.positions
        .filter((position) => position.assetClass === "metals")
        .reduce((sum, position) => sum + position.valueNZD, 0);
      accountBookNZD = Math.max(0, accountBookNZD - metalValue);
    }
  }

  const coveragePositions: CoveragePosition[] = (synthesis?.positions ?? []).map((position) => ({
    label: position.label,
    sublabel: position.sublabel,
    assetClass: position.assetClass,
    valueNZD: position.valueNZD,
  }));
  const portfolioLoaded = portfolioIsLoaded(readPortfolioBook(allRows, [], cashBalanceNZD), coveragePositions);

  const tape = readTape(technicals);
  const report = buildLiveReport(bot, holdings, {
    seedSalt: `${user._id}:${bot}:${context}:${Date.now()}`,
    fxToNZD: fx.ratesToNZD,
    marketOverrides,
    universeIntel: marketTechnicals.length ? marketTechnicals : undefined,
    holdingIntel: technicals,
    tape,
    cashBalanceNZD,
    accountBookNZD: portfolioLoaded && accountBookNZD > 0 ? accountBookNZD : undefined,
    marketFeedUnavailable,
  });
  if (partialFeedLine && !report.keyObservations.includes(partialFeedLine)) {
    report.keyObservations = [...report.keyObservations, partialFeedLine];
  }

  // ---- Intelligence briefing + probabilistic 7-day outlook -------------
  // Scheduled macro catalysts for the next 7 days (deterministic, no key).
  const econEvents = getUpcomingEvents(bot);
  // News-sentiment read — built-in OpenAI with keyword fallback (non-fatal;
  // scoreHeadlines never throws, it degrades to the keyword classifier).
  const newsAssetLabel = bot === "crypto" ? "cryptocurrencies" : "New Zealand & Australian equities";
  const liveNews = await loadMarketNews(bot).catch(() => getMarketNews(bot));
  const headlines = liveNews
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

  // SuperGrok 4.6 · Ultra Advanced ZENITH State narrative — every bot's report is
  // authored in this state whenever the owner's Grok key is configured. Non-fatal:
  // if Grok is unavailable the report still ships with its deterministic summary.
  const botLabel = bot === "crypto" ? "Koins (crypto)" : "Stox (equities)";
  let aiEnhanced = false;
  if (isZenithConfigured()) {
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
      // Full-market BUY candidates + top projected leaders drawn from the report's
      // own sweep (the ENTIRE crypto market for Koins) — fed to the narrative so
      // it can name specific tickers to BUY with concrete, data-grounded reasons.
      const guardBook = portfolioLoaded && accountBookNZD > 0 ? accountBookNZD : undefined;
      const guard = deploymentGuard(bot, tape, cashBalanceNZD, guardBook);
      const canonicalLines = technicals
        .map((t) => {
          const rating = rateAsset(t);
          const aligned = alignedProjection(t);
          return `${rating.action} ${t.ticker} — 7-day base ${aligned.range} (${aligned.probability}% odds, midpoint ${aligned.pct >= 0 ? "+" : ""}${aligned.pct}%), MACD ${t.macdSignal}, regime ${t.regime}, RSI ${t.rsi}. Positive momentum: ${rating.positiveMomentum ? "yes" : "no"}.`;
        })
        .join("\n");
      const positive = technicals.filter((t) => rateAsset(t).positiveMomentum).length;
      const missingFeedLine = marketFeedUnavailable ? marketFeedUnavailableLine(bot) : partialFeedLine;
      const marketBuys =
        report.directRecommendations
          .filter((r) => !r.held && (r.action === "BUY" || r.action === "ACCUMULATE"))
          .map((r) => `${r.ticker} (${r.projected7dPct >= 0 ? "+" : ""}${r.projected7dPct}% proj 7d)`)
          .join(", ") || "none";
      const topProjected = report.projectionLeaders
        .slice(0, 6)
        .map((p) => `${p.ticker} ${p.projected7dPct >= 0 ? "+" : ""}${p.projected7dPct}% (${p.signal})`)
        .join(", ");
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
              (bot === "crypto"
                ? `This is a PURE cryptocurrency report covering the COMPLETE crypto market — never reference NZX, ASX, NASDAQ, DOW or any equities. `
                : `This is a PURE equities report covering NZX, ASX, NASDAQ and DOW JONES — never reference crypto. `) +
              `Write a rich, professional 4-6 sentence executive summary of the short-term (7-day) outlook. ` +
              `Be strictly evidence-based and PROBABILISTIC — speak in expected ranges and likelihoods, and NEVER give a single-point price target that disagrees with the base-case range below. ` +
              `Reference technical posture (RSI/MACD/regime), conviction/confidence %, catalysts, news sentiment, and the single most important illustrative scenario. Do not tell the reader they should buy, and do not instruct a cash deployment. ` +
              `CANONICAL RATINGS are the only actions you may use. Do not upgrade a HOLD into Strong Buy, Accumulate, or ADD. Do not call a name positive momentum unless the line says yes. ` +
              `If you quote a 7-day view for a held name, use that name's base-case range exactly. ` +
              (guard.mode === "full"
                ? `You may name the suitable BUY/ACCUMULATE candidates below, sized with a cash buffer. `
                : `CASH GUARD (${guard.mode}): ${guard.headline} Do not tell the reader to deploy the full cash balance. Do not recommend speculative or outsized movers as buys. `) +
              `CASH RULE: quote the live cash on the guard line. Keep about 10% of the live book in reserve, the same rule as the Headmaster skeleton. Do not say NZ$100,000 is available, do not keep 75% in reserve, and do not start from NZ$25,000. ` +
              (holdings.length === 0
                ? `The member has empty holdings and NZ$${Math.round(cashBalanceNZD)} cash — follow the cash guard. `
                : `The member ALREADY HOLDS live positions. Open by naming each held ticker with its CANONICAL action. ` +
                  `Never describe the book, portfolio, or holdings as empty, cash-only, or unmonitored. `) +
              `Positive momentum count you must match if you mention it: ${positive} of ${technicals.length}. ` +
              `Close with an italic disclaimer that this is informational intelligence, not financial advice. Use **bold** for ticker names.\n\n` +
              `Market: ${report.marketLabel}.\n` +
              `Overall read: ${briefing.overall.bias} bias, ${briefing.overall.level} conviction, net ${briefing.overall.score}/100.\n` +
              `News sentiment: ${sentiment.label} (${sentiment.score}/100, ${sentiment.method} model).\n` +
              `Catalysts next 7 days: ${catalystLine}.\n` +
              `Portfolio metrics: health ${metrics.healthScore}/100 (${metrics.healthLabel}), annualised volatility ${metrics.volatility}%, Sharpe ${metrics.sharpe}, 7-day alpha potential ${metrics.alphaPotentialPct}%.\n` +
              `CANONICAL RATINGS (source of truth):\n${canonicalLines || "(none)"}\n` +
              `SELL flags (held): ${sells}. High-conviction BUY candidates (held): ${buys}.\n` +
              `Suitable new BUY candidates only: ${marketBuys}.\n` +
              `Top 7-day projected leaders across the market (context, not automatic buys): ${topProjected}.\n` +
              (holdings.length
                ? `Holdings:\n${lines}\n\n`
                : `Holdings: none — cash NZ$${Math.round(cashBalanceNZD)} available, subject to the cash guard.\n\n`) +
              (missingFeedLine ? `${missingFeedLine}\n` : "") +
              `Write the ZENITH executive summary now. Repeat the canonical actions. Do not contradict them.`,
          },
        ],
      });
      if (narrative && narrative.length > 40) {
        const grounded = groundReportNarrative(
          narrative,
          holdings.map((h) => ({ ticker: h.ticker, shares: h.shares, name: h.name }))
        );
        const contradicts = narrativeContradictsCanonical(
          grounded.text,
          technicals.map((t) => ({ ticker: t.ticker, action: rateAsset(t).action })),
          guard,
          { positive, total: technicals.length }
        );
        if (grounded.discardedEmptyClaim || !grounded.text || contradicts) {
          console.warn(
            contradicts
              ? `[report-service] Discarded ZENITH narrative that contradicted canonical ratings or the cash guard`
              : `[report-service] Discarded ZENITH narrative that described an empty book while ${holdings.length} ${bot} holdings are live`
          );
        } else {
          report.executiveSummary = grounded.text;
          // Keep the briefing's headline summary in lock-step with the report.
          briefing.executiveSummary = grounded.text;
          briefing.aiSummary = true;
          aiEnhanced = true;
          console.log(`[report-service] ZENITH narrative applied for user ${user._id}`);
        }
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
      .filter((a) => !alertIsEffectivelyArchived(a.status, heldQuantityForTicker(scoped, a.ticker)))
      .map((a) => ({
        ticker: a.ticker,
        currentPrice: holdings.find((h) => h.ticker.toUpperCase() === String(a.ticker).toUpperCase())?.price || Number(a.hard_sell_price) || 0,
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
  const locked = await relockSeededReportPrices(report);
  const bookNZD =
    portfolioLoaded && accountBookNZD > 0
      ? accountBookNZD
      : (report.portfolio?.value || 0) + cashBalanceNZD;
  const delivered = sanitizeGuardedReport(locked, { cashNZD: cashBalanceNZD, bookNZD });
  const html = renderReportHtml(delivered, {
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
    `[report-service] Report built for user ${user._id} (${context}, pricing: ${usedLive ? "live" : "stored or unpriced"}, portfolio=${portfolioLoaded}, marketFeed=${marketFeedUnavailable ? "unavailable" : "live"})`
  );

  // PDF + saved row for every completed run. Email stays on the sleeve that
  // has positions — a market-only run is still produced and saved.
  let pdfFileName: string | null = null;
  let pdfUrl: string | null = null;
  let emailed = false;
  let reportId: string | null = null;
  if (deliver) {
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

    const subjectPrefix = context === "scheduled" ? "Your scheduled briefing · " : "";
    if (holdings.length > 0) {
      try {
        const sent = await totalumSdk.email.sendEmail({
          to: [user.email],
          subject: `${subjectPrefix}${report.title} — ${generatedAtLabel}`,
          html,
          fromName: "AetherForge AI",
          ...(pdfUrl
            ? { attachments: [{ filename: `${report.title}.pdf`, url: pdfUrl, contentType: "application/pdf" }] }
            : {}),
        });
        emailed = reportEmailWasDelivered(sent);
        if (emailed) console.log(`[report-service] Report emailed to ${user.email}`);
        else console.error("[report-service] Report email was not accepted; the card will not say Emailed.");
      } catch (mailErr) {
        console.error("[report-service] Email delivery failed (non-fatal):", mailErr);
      }
    } else {
      console.log(`[report-service] ${bot} report saved without email — this sleeve has no positions`);
    }

    try {
      const saved = await totalumSdk.crud.createRecord("report", {
        title: report.title,
        user: user._id,
        bot,
        market_label: report.marketLabel,
        executive_summary: delivered.executiveSummary,
        payload: JSON.stringify({ ...delivered, emailDelivered: emailed }),
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
  }

  return { report: delivered, pdfUrl, reportId, emailed, aiEnhanced, monitored: holdings.length, generatedAtLabel };
}
