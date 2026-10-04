import "server-only";
import { totalumSdk } from "@/lib/totalum";
import { buildLiveReport, type LiveHolding, type BotKind } from "@/lib/apex";
import { renderReportHtml, type ReportAlert } from "@/lib/report-html";
import { analyzeSecurity, analyzeUniverse, getMarketNews, universeFor, type SecurityIntel } from "@/lib/market-intel";
import { loadMarketNews } from "@/lib/market-news";
import { computePortfolioMetrics, buildActionableIntelligence } from "@/lib/analytics";
import { getUpcomingEvents } from "@/lib/econ-calendar";
import { scoreHeadlines } from "@/lib/news-sentiment";
import { buildIntelligenceBriefing } from "@/lib/briefing";
import { sanitizeGuardedReport, readTape } from "@/lib/report-consistency";
import { fetchQuotesForAssetClass, isLiveConfiguredFor } from "@/lib/market-data";
import { fetchCryptoMarketIntel } from "@/lib/koins-market";
import { getFxSnapshot } from "@/lib/fx";
import type { Stock } from "@/lib/portfolio";
import { formatAucklandDateTime } from "@/lib/entitlements";
import { ownerIdOf } from "@/lib/report-book";
import { alertIsEffectivelyArchived, heldQuantityForTicker } from "@/lib/alert-lifecycle";
import { relockSeededReportPrices } from "@/lib/paper-quote-lock.server";
import { reportEmailMessageId, reportEmailWasDelivered } from "@/lib/report-email";
import { publishSharedBookLog, fullBookSentence } from "@/lib/book-log";
import {
  annotateTickerCalls,
  koinsCoverageSentences,
  openCallFromTicker,
  priorCallsFromPayloads,
  rollClosedCallScore,
  type SevenDayCall,
} from "@/lib/report-topup";
import { loadTotalumSynthesis } from "@/lib/totalum-service";
import type { TotalumSynthesis } from "@/lib/totalum-engine";
import { portfolioIsLoaded, readPortfolioBook, type CoveragePosition } from "@/lib/report-scope";
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

async function loadPriorReportCalls(userId: string, bot: BotKind) {
  try {
    const res = await totalumSdk.crud.query("report", {
      _filter: { user: userId, bot },
      _sort: { createdAt: "desc" },
      _limit: 12,
    });
    const rows = ((res as { data?: Array<{ payload?: unknown }> })?.data || []).map((row) => row.payload);
    return priorCallsFromPayloads(rows);
  } catch (err) {
    console.error("[report-service] Prior closed-call load failed (non-fatal):", err);
    return priorCallsFromPayloads([]);
  }
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
 * Builds a full report from the user's holdings for
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
    const livePrice = quote?.price && quote.price > 0 ? quote.price : 0;
    if (bot === "crypto") {
      holdings.push({
        ticker,
        name: r.company_name || ticker,
        price: livePrice,
        shares: Number(r.shares) || 0,
        purchasePrice: Number(r.purchase_price) || 0,
        priceUnavailable: !(livePrice > 0),
      });
      continue;
    }
    const price = livePrice > 0 ? livePrice : stored;
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
  const stockObjs: Stock[] = holdings.filter((h) => !h.priceUnavailable && h.price > 0).map((h, i) => ({
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
  const aiEnhanced = false;

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
  const classValue = (key: string) =>
    synthesis?.classAllocation?.find((row) => row.assetClass === key)?.valueNZD ?? 0;
  const prices: Record<string, number> = {};
  for (const holding of holdings) {
    if (holding.price > 0 && !holding.priceUnavailable) prices[holding.ticker.toUpperCase()] = holding.price;
  }
  for (const [ticker, price] of Object.entries(marketOverrides)) {
    if (price > 0) prices[ticker.toUpperCase()] = price;
  }
  const bookLog = publishSharedBookLog({
    cashNZD: classValue("cash") || cashBalanceNZD,
    stocksNZD: classValue("equities") || (bot === "stock" ? delivered.portfolio?.value || 0 : 0),
    cryptoNZD: classValue("crypto") || (bot === "crypto" ? delivered.portfolio?.value || 0 : 0),
    metalsNZD: classValue("metals"),
    sleeveNZD: delivered.portfolio?.value || 0,
    sleeveLabel: bot === "crypto" ? "Koins" : "Stox",
    prices,
  });
  delivered.tickers = annotateTickerCalls(delivered.tickers, bookLog, bot);
  if (bot === "crypto") {
    const lines = koinsCoverageSentences(
      holdings.map((holding) => ({
        ticker: holding.ticker,
        name: holding.name,
        shares: holding.shares || 0,
        livePrice: holding.priceUnavailable ? null : holding.price,
      }))
    );
    const have = new Set(delivered.keyObservations);
    delivered.keyObservations = [...delivered.keyObservations, ...lines.filter((line) => !have.has(line))];
  }
  const prior = await loadPriorReportCalls(user._id, bot);
  const closedCallScore = rollClosedCallScore(prior.score, prior.calls, bookLog.prices, now.getTime());
  const openCalls = delivered.tickers
    .map((ticker) => openCallFromTicker(ticker, now.getTime()))
    .filter((call): call is SevenDayCall => call != null);
  delivered.bookSentence = fullBookSentence(bookLog);
  delivered.reserveSentence = bookLog.reserveSentence;
  delivered.closedCallSentence = closedCallScore.sentence;
  const html = renderReportHtml(delivered, {
    userName: user.name || undefined,
    generatedAtLabel,
    alerts,
    aiEnhanced,
    engine: report.engine,
    technicals,
    metrics,
    intelligence,
    bookLog,
    closedCallScore,
  });
  console.log(
    `[report-service] Report built for user ${user._id} (${context}, pricing: ${usedLive ? "live" : "stored or unpriced"}, portfolio=${portfolioLoaded}, marketFeed=${marketFeedUnavailable ? "unavailable" : "live"})`
  );

  // PDF + saved row for every completed run. Email stays on the sleeve that
  // has positions — a market-only run is still produced and saved.
  let pdfFileName: string | null = null;
  let pdfUrl: string | null = null;
  let emailed = false;
  let emailMessageId: string | null = null;
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
        emailMessageId = reportEmailMessageId(sent);
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
        payload: JSON.stringify({
          ...delivered,
          emailDelivered: emailed,
          emailMessageId,
          openCalls,
          closedCallScore,
        }),
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
