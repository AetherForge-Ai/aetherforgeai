import { NextResponse } from "next/server";
import { getCurrentUser, hasPaidSubscription } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import { generateTrialReport, type TrialTickerInput } from "@/lib/trial-report";
import type { BotKind } from "@/lib/trial-types";

/**
 * POST /api/free-trial/run
 *
 * Runs the ONE-TIME "ZENITH MODE · ULTRA ADVANCED" trial report for a signed-up,
 * non-subscribed user who has not yet consumed their single trial.
 *
 * Gate (all must hold):
 *   · authenticated
 *   · NOT on an active paid subscription
 *   · user.trial_used !== "yes"
 *
 * Body: { bot: "crypto" | "stock", tickers: [{ symbol, shares?, avgPrice? }] } (1–3)
 *
 * We atomically claim the trial (set trial_used="yes" + trial_used_at) BEFORE
 * generating, so a double-submit can never yield two free reports. If generation
 * fails hard we release the claim so the user can retry.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "You must be signed in to run your free report." }, { status: 401 });
    }

    if (hasPaidSubscription(user)) {
      return NextResponse.json(
        { ok: false, error: "You're on a paid plan — use the full dashboard to generate reports." },
        { status: 403 }
      );
    }

    // Re-read the live record to avoid any stale session on the one-time flag.
    let fresh: any = null;
    try {
      const res = await totalumSdk.crud.getRecordById("user", user._id);
      fresh = (res as any)?.data ?? null;
    } catch (err) {
      console.error("[free-trial/run] Failed to re-read user record:", err);
    }
    if ((fresh?.trial_used ?? user.trial_used) === "yes") {
      return NextResponse.json(
        { ok: false, error: "You've already used your one-time free Zenith report. Subscribe for unlimited reports." },
        { status: 409 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      bot?: string;
      tickers?: { symbol?: string; shares?: number | string | null; avgPrice?: number | string | null }[];
    };

    const bot = body.bot === "crypto" || body.bot === "stock" ? (body.bot as BotKind) : null;
    if (!bot) {
      return NextResponse.json({ ok: false, error: "Choose a bot: 'crypto' or 'stock'." }, { status: 400 });
    }

    const rawTickers = Array.isArray(body.tickers) ? body.tickers : [];
    const tickers: TrialTickerInput[] = rawTickers
      .map((t) => ({
        symbol: String(t.symbol ?? "").trim().toUpperCase(),
        shares: t.shares != null && t.shares !== "" ? Number(t.shares) : null,
        avgPrice: t.avgPrice != null && t.avgPrice !== "" ? Number(t.avgPrice) : null,
      }))
      .filter((t) => t.symbol.length > 0)
      // De-dupe by symbol, cap at 3.
      .filter((t, i, arr) => arr.findIndex((x) => x.symbol === t.symbol) === i)
      .slice(0, 3);

    if (!tickers.length) {
      return NextResponse.json({ ok: false, error: "Enter at least one ticker (up to 3)." }, { status: 400 });
    }
    for (const t of tickers) {
      if (t.shares != null && (!isFinite(t.shares) || t.shares < 0)) {
        return NextResponse.json({ ok: false, error: `Invalid share amount for ${t.symbol}.` }, { status: 400 });
      }
      if (t.avgPrice != null && (!isFinite(t.avgPrice) || t.avgPrice < 0)) {
        return NextResponse.json({ ok: false, error: `Invalid average price for ${t.symbol}.` }, { status: 400 });
      }
    }

    console.log(`[free-trial/run] Claiming trial for ${user._id} · bot=${bot} · tickers=${tickers.map((t) => t.symbol).join(",")}`);

    // Atomically claim the one-time trial BEFORE generating.
    const claimedAt = new Date().toISOString();
    try {
      await totalumSdk.crud.editRecordById("user", user._id, { trial_used: "yes", trial_used_at: claimedAt });
    } catch (claimErr) {
      console.error("[free-trial/run] Failed to claim trial:", claimErr);
      return NextResponse.json({ ok: false, error: "Could not start your free report. Please try again." }, { status: 500 });
    }

    // Generate → PDF → email → persist. Release the claim on a hard failure.
    let result;
    try {
      result = await generateTrialReport({
        user: { _id: user._id, email: user.email, name: user.name },
        bot,
        tickers,
      });
    } catch (genErr: any) {
      console.error("[free-trial/run] Generation failed — releasing trial claim:", genErr);
      try {
        await totalumSdk.crud.editRecordById("user", user._id, { trial_used: "no", trial_used_at: null });
      } catch (releaseErr) {
        console.error("[free-trial/run] Failed to release trial claim:", releaseErr);
      }
      return NextResponse.json(
        { ok: false, error: genErr?.message || "We couldn't generate your report. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        report: result.report,
        pdfUrl: result.pdfUrl,
        emailed: result.emailed,
        aiEnhanced: result.aiEnhanced,
        email: user.email,
      },
    });
  } catch (err: any) {
    console.error("[free-trial/run] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unexpected error running your report." }, { status: 500 });
  }
}
