import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import type { BotKind } from "@/lib/apex";
import { generateReportForUser } from "@/lib/report-service";
import { checkReportQuota } from "@/lib/entitlements";

const schema = z.object({ bot: z.enum(["stock", "crypto"]) });

/** Most recent report timestamp for a user (ISO), or null if they have none. */
async function lastReportAt(userId: string): Promise<string | null> {
  const res = await totalumSdk.crud.query("report", {
    _filter: { user: userId },
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

    // Cadence gate — one report per plan window (across BOTH bots). Authoritative:
    // the client countdown is cosmetic; this is what actually blocks over-use.
    const previous = await lastReportAt(user._id);
    const quota = checkReportQuota(user.subscription_plan, previous);
    if (!quota.allowed) {
      console.log(
        `[api/reports] Cadence reached for user ${user._id} (${quota.cadence.label}) — next at ${quota.nextAllowedAt}`
      );
      return NextResponse.json(
        {
          ok: false,
          error: `You've used your ${quota.cadence.label} allowance. Your next full report unlocks soon — upgrade your plan for more frequent reports.`,
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

    const lastAt = reports[0]?.generatedAt || null;
    const quota = checkReportQuota(user.subscription_plan, lastAt);

    console.log(`[api/reports] GET returned ${reports.length} reports for user ${user._id}`);
    return NextResponse.json({
      ok: true,
      data: {
        reports,
        quota: {
          allowed: quota.allowed,
          waitMs: quota.waitMs,
          nextAllowedAt: quota.nextAllowedAt,
          lastReportAt: quota.lastReportAt,
          cadenceLabel: quota.cadence.label,
          cadenceUnit: quota.cadence.unit,
        },
      },
    });
  } catch (err: any) {
    console.error("[api/reports] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load reports" }, { status: 500 });
  }
}
