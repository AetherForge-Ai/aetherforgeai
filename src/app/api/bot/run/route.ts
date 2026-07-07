import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { referencePrice, simulateTick } from "@/lib/market";
import { buildLiveReport, type LiveHolding, type BotKind } from "@/lib/apex";
import { getFxSnapshot } from "@/lib/fx";
import { analyzeSecurity, getMarketNews, type SecurityIntel } from "@/lib/market-intel";
import { getUpcomingEvents } from "@/lib/econ-calendar";
import { scoreHeadlines } from "@/lib/news-sentiment";
import { buildIntelligenceBriefing } from "@/lib/briefing";

const schema = z.object({ bot: z.enum(["stock", "crypto"]) });

/**
 * POST /api/bot/run
 * Runs a Apex-Mode monitor for the logged-in subscriber and returns a live
 * report built from their real holdings for the requested asset class.
 *
 * Access rules:
 *  - Must be authenticated.
 *  - When Stripe is configured, must have an active subscription AND the plan's
 *    bot_access must cover the requested bot (stock | crypto | both).
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

    // Subscription + bot-access gate (soft in demo mode when no Stripe key).
    if (isStripeConfigured()) {
      if (!hasActiveSubscription(user)) {
        return NextResponse.json({ ok: false, error: "An active subscription is required to run this bot." }, { status: 403 });
      }
      const access = user.bot_access ?? "none";
      const allowed = access === "both" || access === bot;
      if (!allowed) {
        return NextResponse.json(
          { ok: false, error: `Your plan does not include the ${bot} bot. Upgrade to unlock it.` },
          { status: 403 }
        );
      }
    }

    // Pull the user's holdings for this asset class. Legacy rows may not have
    // asset_type set — treat those as "stock" so existing portfolios still run.
    const result = await totalumSdk.crud.query("stock", {
      _filter: { user: user._id },
      _limit: 500,
    });
    const rows = ((result?.data as any[]) || []).filter((r) => {
      const at = r.asset_type || "stock";
      return at === bot;
    });

    const limit = user.ticker_limit && user.ticker_limit > 0 ? user.ticker_limit : rows.length;
    const scoped = rows.slice(0, limit);

    const holdings: LiveHolding[] = scoped.map((r) => {
      const ref = referencePrice(r.ticker, Number(r.current_price) || Number(r.purchase_price) || 1);
      const price = simulateTick(ref);
      return {
        ticker: r.ticker,
        name: r.company_name || r.ticker,
        price,
        shares: Number(r.shares) || 0,
        purchasePrice: Number(r.purchase_price) || price,
      };
    });

    const fx = await getFxSnapshot();
    const report = buildLiveReport(bot, holdings, {
      seedSalt: `${user._id}:${bot}`,
      fxToNZD: fx.ratesToNZD,
    });
    console.log(`[api/bot/run] user ${user._id} ran ${bot} bot over ${holdings.length} holdings`);

    // Attach the 7-day probabilistic intelligence briefing. Every source is
    // non-fatal: technicals are deterministic, the calendar is scheduled and
    // scoreHeadlines degrades to a keyword classifier — so the briefing can
    // never make the report worse than the base bot.
    try {
      const technicals: SecurityIntel[] = scoped.map((r) =>
        analyzeSecurity(r.ticker, Number(r.current_price) || undefined, r.company_name || r.ticker)
      );
      const econEvents = getUpcomingEvents(bot);
      const newsAssetLabel = bot === "crypto" ? "cryptocurrencies" : "New Zealand & Australian equities";
      const headlines = getMarketNews(bot)
        .slice(0, 16)
        .map((n) => ({ headline: n.headline, source: n.source }));
      const sentiment = await scoreHeadlines(headlines, newsAssetLabel);
      report.briefing = buildIntelligenceBriefing({
        bot,
        marketLabel: report.marketLabel,
        technicals,
        events: econEvents,
        sentiment,
      });
      console.log(
        `[api/bot/run] briefing attached: ${technicals.length} technicals, ${econEvents.length} events, sentiment ${sentiment.label} (${sentiment.method})`
      );
    } catch (briefErr) {
      console.error("[api/bot/run] briefing build failed (non-fatal):", briefErr);
    }

    return NextResponse.json({
      ok: true,
      data: { report, monitored: holdings.length, tickerLimit: user.ticker_limit ?? null },
    });
  } catch (err: any) {
    console.error("[api/bot/run] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to run bot" }, { status: 500 });
  }
}
