import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { type BotKind } from "@/lib/apex";
import { generateReportForUser } from "@/lib/report-service";

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

    const out = await generateReportForUser(
      {
        _id: user._id,
        name: user.name,
        email: user.email,
        ticker_limit: user.ticker_limit,
        cash_balance: user.cash_balance,
      },
      bot,
      "inline",
      { deliver: false }
    );
    console.log(`[api/bot/run] user ${user._id} ran ${bot} bot over ${out.monitored} holdings`);

    return NextResponse.json({
      ok: true,
      data: { report: out.report, monitored: out.monitored, tickerLimit: user.ticker_limit ?? null },
    });
  } catch (err: any) {
    console.error("[api/bot/run] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to run bot" }, { status: 500 });
  }
}
