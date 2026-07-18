import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import type { BotKind } from "@/lib/apex";
import { generateReportForUser } from "@/lib/report-service";
import { checkReportQuota } from "@/lib/entitlements";

const schema = z.object({ bot: z.enum(["stock", "crypto"]) });

/**
 * Most recent report timestamp for a user AND a specific bot (ISO), or null.
 *
 * The daily allowance is now PER report system: one full Stox report per day AND
 * one full Koins report per day, tracked independently. Filtering by `bot` is
 * what makes the two allowances independent — running Stox never consumes the
 * Koins allowance and vice-versa.
 */
async function lastReportAt(userId: string, bot: BotKind): Promise<string | null> {
  const res = await totalumSdk.crud.query("report", {
    _filter: { user: userId, bot },
    _sort: { createdAt: "desc" },
    _limit: 1,
  });
  const row = (res?.data as any[])?.[0];
  if (!row) return null;
  return row.generated_at || row.createdAt || null;
}

/**
 * POST /api/reports
 * Generates a full SuperGrok 4.3 ULTRA ADVANCED report for the logged-in user's
 * holdings (via the shared report service), emails it with the PDF attached,
 * persists it and returns it for inline dashboard display.
 *
 * Enforces the plan's report cadence: Free & Apex Weekly → 1 report / week;
 * Apex Monthly / Yearly / Dual → 1 report / day.
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

    // Cadence gate — one report per plan window, PER BOT (independent Stox &
    // Koins allowances). Authoritative: the client countdown is cosmetic; this is
    // what actually blocks over-use.
    const previous = await lastReportAt(user._id, bot);
    const quota = checkReportQuota(user.subscription_plan, previous);
    if (!quota.allowed) {
      const botLabel = bot === "crypto" ? "Koins" : "Stox";
      console.log(
        `[api/reports] Cadence reached for user ${user._id} · ${botLabel} (${quota.cadence.label}) — next at ${quota.nextAllowedAt}`
      );
      return NextResponse.json(
        {
          ok: false,
          error: `You've used your ${botLabel} ${quota.cadence.label} allowance. Your next full ${botLabel} report unlocks soon — your other report system is tracked separately.`,
          data: {
            code: "report_cadence",
            nextAllowedAt: quota.nextAllowedAt,
            waitMs: quota.waitMs,
            cadence: quota.cadence.label,
          },
        },
        { status: 429 }
      );
    }

    const out = await generateReportForUser(user, bot, "manual");
    console.log(`[api/reports] Manual report delivered for user ${user._id} (${bot})`);

    // The report was just generated "now", so the next unlock is now + cadence.
    const next = checkReportQuota(user.subscription_plan, new Date().toISOString());

    return NextResponse.json({
      ok: true,
      data: {
        report: out.report,
        pdfUrl: out.pdfUrl,
        reportId: out.reportId,
        emailed: out.emailed,
        aiEnhanced: out.aiEnhanced,
        monitored: out.monitored,
        generatedAtLabel: out.generatedAtLabel,
        // Echo the next unlock so the UI can immediately start the countdown.
        nextAllowedAt: next.nextAllowedAt,
        cadenceLabel: next.cadence.label,
      },
    });
  } catch (err: any) {
    console.error("[api/reports] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to generate report" }, { status: 500 });
  }
}

/**
 * GET /api/reports — list the user's past reports (most recent first) plus their
 * current report-cadence status so the dashboard can render a live countdown.
 */
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
      trigger: r.trigger || "manual",
      generatedAt: r.generated_at || r.createdAt,
      pdfUrl: r.pdf_file?.url ?? null,
    }));

    // Independent per-bot allowances — derive each bot's most-recent report from
    // the fetched history so Stox and Koins each get their own countdown.
    const lastFor = (b: BotKind) => reports.find((r) => r.bot === b)?.generatedAt || null;
    const buildQuota = (b: BotKind) => {
      const q = checkReportQuota(user.subscription_plan, lastFor(b));
      return {
        allowed: q.allowed,
        waitMs: q.waitMs,
        nextAllowedAt: q.nextAllowedAt,
        lastReportAt: q.lastReportAt,
        cadenceLabel: q.cadence.label,
        cadenceUnit: q.cadence.unit,
      };
    };
    const stockQuota = buildQuota("stock");
    const cryptoQuota = buildQuota("crypto");

    console.log(
      `[api/reports] GET returned ${reports.length} reports for user ${user._id} ` +
        `(Stox allowed=${stockQuota.allowed}, Koins allowed=${cryptoQuota.allowed})`
    );
    return NextResponse.json({
      ok: true,
      data: {
        reports,
        // Per report-system allowance (Stox + Koins tracked independently).
        quota: { stock: stockQuota, crypto: cryptoQuota },
      },
    });
  } catch (err: any) {
    console.error("[api/reports] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load reports" }, { status: 500 });
  }
}
