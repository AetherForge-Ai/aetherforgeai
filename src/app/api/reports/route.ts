import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import type { BotKind } from "@/lib/apex";
import { generateReportForUser, loadStockRowsForAccount, type GeneratedReport } from "@/lib/report-service";
import { checkReportQuota } from "@/lib/entitlements";
import { isRecentReportDuplicate } from "@/lib/report-dedupe";
import { liveBookForAccount, reconcileNarrativeWithLiveBook, reconcileStoredReport } from "@/lib/report-book";
import { requestClaimsOtherUser } from "@/lib/account-guard";
import { accountMismatchResponse, privateJson } from "@/lib/account-response";

const schema = z.object({ bot: z.enum(["stock", "crypto"]) });

const reportJobs = new Map<string, Promise<GeneratedReport>>();

function coalesceReport(userId: string, bot: BotKind, run: () => Promise<GeneratedReport>): Promise<GeneratedReport> {
  const key = `${userId}:${bot}`;
  const existing = reportJobs.get(key);
  if (existing) return existing;
  const job = run().finally(() => {
    if (reportJobs.get(key) === job) reportJobs.delete(key);
  });
  reportJobs.set(key, job);
  return job;
}

/**
 * Most recent report timestamp for a user AND a specific bot (ISO), or null.
 *
 * The allowance is PER report system: one full Stox report AND one full Koins
 * report per window, tracked independently. Filtering by `bot` is
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
 * Generates a full SuperGrok 4.6 ULTRA ADVANCED report for the logged-in user's
 * holdings (via the shared report service), emails it with the PDF attached,
 * persists it and returns it for inline dashboard display.
 *
 * Enforces the plan's report cadence: Free & Apex Weekly → 1 report / week;
 * paid tiers → 1 report every 4 hours (rolling), per bot.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      console.error("[api/reports] Refusing cross-account generate", {
        sessionUserId: user._id,
        claimed: req.headers.get("x-af-user-id"),
      });
      return accountMismatchResponse(user._id);
    }

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
      if (isRecentReportDuplicate(previous)) {
        console.log(`[api/reports] Duplicate ${botLabel} follow-up ignored for user ${user._id}`);
        return NextResponse.json(
          { ok: false, error: "duplicate", data: { code: "report_duplicate", duplicate: true } },
          { status: 200 }
        );
      }
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

    const out = await coalesceReport(user._id, bot, () => generateReportForUser(user, bot, "manual"));
    console.log(`[api/reports] Manual report delivered for user ${user._id} (${bot})`);

    // The report was just generated "now", so the next unlock is now + cadence.
    const next = checkReportQuota(user.subscription_plan, new Date().toISOString());

    return privateJson({
      ok: true,
      userId: user._id,
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
        cadenceMs: next.cadence.ms,
        perLabel: next.cadence.perLabel,
        cadenceUnit: next.cadence.unit,
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
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.identityConflict || requestClaimsOtherUser(req, user._id)) {
      console.error("[api/reports] Refusing cross-account history", {
        sessionUserId: user._id,
        claimed: req.headers.get("x-af-user-id"),
      });
      return accountMismatchResponse(user._id);
    }

    const [res, book] = await Promise.all([
      totalumSdk.crud.query("report", {
        _filter: { user: user._id },
        _sort: { createdAt: "desc" },
        _limit: 50,
      }),
      loadStockRowsForAccount(user._id),
    ]);
    const rows = (res?.data as any[]) || [];
    // A failed holdings load must not be treated as an empty book — leave the
    // stored wording for the client to reconcile against the dashboard book.
    const liveRows = book.bookLoaded ? book.rows : [];
    const liveFor = (bot: BotKind) => liveBookForAccount(liveRows, user._id, bot);
    const reports = rows.map((r) => {
      let payload: unknown = null;
      if (typeof r.payload === "string" && r.payload.trim()) {
        try {
          payload = JSON.parse(r.payload);
        } catch {
          payload = null;
        }
      } else if (r.payload && typeof r.payload === "object") {
        payload = r.payload;
      }
      const reportBot: BotKind = r.bot === "crypto" ? "crypto" : "stock";
      const liveBook = liveFor(reportBot);
      if (payload && typeof payload === "object") {
        payload = reconcileStoredReport(payload as Record<string, unknown>, liveBook);
      }
      const fromPayload =
        payload && typeof payload === "object" && "executiveSummary" in payload
          ? String((payload as { executiveSummary?: string }).executiveSummary || "")
          : "";
      const executiveSummary = reconcileNarrativeWithLiveBook(r.executive_summary || fromPayload, liveBook);
      // Searchable inline text for history view (prefer full payload summary + headline fields).
      const textBody = [
        executiveSummary,
        payload && typeof payload === "object" && "marketLabel" in (payload as object)
          ? String((payload as { marketLabel?: string }).marketLabel || "")
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      return {
        _id: r._id,
        title: r.title,
        bot: r.bot,
        marketLabel: r.market_label,
        executiveSummary,
        textBody,
        payload,
        emailed: r.emailed,
        aiEnhanced: r.ai_enhanced === "yes",
        trigger: r.trigger || "manual",
        generatedAt: r.generated_at || r.createdAt,
        pdfUrl: r.pdf_file?.url ?? null,
      };
    });

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
        cadenceMs: q.cadence.ms,
        perLabel: q.cadence.perLabel,
      };
    };
    const stockQuota = buildQuota("stock");
    const cryptoQuota = buildQuota("crypto");

    console.log(
      `[api/reports] GET returned ${reports.length} reports for user ${user._id} ` +
        `(bookLoaded=${book.bookLoaded}, holdings=${liveRows.length}, ` +
        `Stox allowed=${stockQuota.allowed}, Koins allowed=${cryptoQuota.allowed})`
    );
    return privateJson({
      ok: true,
      userId: user._id,
      data: {
        reports,
        bookLoaded: book.bookLoaded,
        // Per report-system allowance (Stox + Koins tracked independently).
        quota: { stock: stockQuota, crypto: cryptoQuota },
      },
    });
  } catch (err: any) {
    console.error("[api/reports] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load reports" }, { status: 500 });
  }
}
