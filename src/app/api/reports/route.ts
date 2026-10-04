import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isStripeConfigured, hasActiveSubscription } from "@/lib/session";
import { totalumSdk } from "@/lib/totalum";
import type { BotKind } from "@/lib/apex";
import {
  EmptyBookReportError,
  generateReportForUser,
  loadStockRowsForAccount,
  type GeneratedReport,
} from "@/lib/report-service";
import {
  checkReportQuota,
  evaluateFreeReportQuota,
  isFreeReportPlan,
  monthlyReportLimit,
  monthlyReportQuota,
  reportCadence,
  aucklandMonthKey,
  type ReportQuota,
} from "@/lib/entitlements";
import { isRecentReportDuplicate } from "@/lib/report-dedupe";
import { liveBookForAccount, reconcileNarrativeWithLiveBook, reconcileStoredReport } from "@/lib/report-book";
import { relockSeededReportPrices } from "@/lib/paper-quote-lock.server";
import { reportPayloadWasEmailed } from "@/lib/report-email";
import { loadTotalumSynthesis } from "@/lib/totalum-service";
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
function quotaFromMonthly(
  used: number,
  lastReportAt: string | null,
  limit: number,
  plan: string | null | undefined,
  now: number = Date.now()
): ReportQuota & { reportsUsed: number; reportsLimit: number } {
  const q = monthlyReportQuota(used, now, limit, reportCadence(plan));
  return { ...q, lastReportAt, reportsUsed: used, reportsLimit: limit };
}

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
 * Padded UTC bounds covering the full Pacific/Auckland calendar month for
 * `monthKey` ("yyyy-MM"), widened by a day on each side to safely cover the
 * NZST/NZDT (+12/+13h) offset without a full timezone-conversion library.
 * The DB filter only narrows the candidate rows — exact month membership is
 * re-checked in JS via aucklandMonthKey() on each row in countFreeReportsThisMonth.
 */
function aucklandMonthUtcBoundsPadded(monthKey: string): { gte: string; lte: string } {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(Date.UTC(year, month, 1));
  end.setUTCDate(end.getUTCDate() + 1);
  return { gte: start.toISOString(), lte: end.toISOString() };
}

/**
 * Reports (any bot) a Free user has generated in the current Pacific/Auckland
 * calendar month. Free's 3-report cap is a single pooled monthly allowance
 * across Stox + Koins — not a per-bot allowance like the paid cadence above.
 */
async function countFreeReportsThisMonth(userId: string, now: number): Promise<{ count: number; monthKey: string }> {
  const monthKey = aucklandMonthKey(now);
  const { gte, lte } = aucklandMonthUtcBoundsPadded(monthKey);
  const res = await totalumSdk.crud.query("report", {
    _filter: { user: userId, createdAt: { gte, lte } },
    _sort: { createdAt: "desc" },
    _limit: 100,
  });
  const rows = (res?.data as any[]) || [];
  const count = rows.filter(
    (r) => aucklandMonthKey(new Date(r.generated_at || r.createdAt).getTime()) === monthKey
  ).length;
  return { count, monthKey };
}

/**
 * POST /api/reports
 * Generates a full SuperGrok 4.6 ULTRA ADVANCED report for the logged-in user's
 * holdings (via the shared report service), emails it with the PDF attached,
 * persists it and returns it for inline dashboard display.
 *
 * Free: 3 AI reports per Auckland month. Starter: 15 per Auckland month.
 * Apex Weekly: 1 report / week per bot. Pro and Ultimate: 1 report every 4 hours per bot.
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

    const monthLimit = monthlyReportLimit(user.subscription_plan);
    let monthAfterRun: { used: number; limit: number; remaining: number; monthKey: string } | null = null;

    if (monthLimit != null) {
      // Free is 3 and Starter is 15, pooled across the account for the Auckland month.
      const now = Date.now();
      const { count: usedThisMonth, monthKey } = await countFreeReportsThisMonth(user._id, now);
      const monthQuota = evaluateFreeReportQuota(usedThisMonth, now, monthLimit);
      const previous = await lastReportAt(user._id, bot);
      const botLabel = bot === "crypto" ? "Koins" : "Stox";
      if (isRecentReportDuplicate(previous)) {
        console.log(`[api/reports] Duplicate ${botLabel} follow-up ignored for user ${user._id}`);
        return NextResponse.json(
          { ok: false, error: "duplicate", data: { code: "report_duplicate", duplicate: true } },
          { status: 200 }
        );
      }
      if (!monthQuota.allowed) {
        const blocked = monthlyReportQuota(monthQuota.used, now, monthQuota.limit, reportCadence(user.subscription_plan));
        const planLabel = isFreeReportPlan(user.subscription_plan) ? "free" : "Starter";
        console.log(
          `[api/reports] Monthly cap reached for user ${user._id} (${monthQuota.used}/${monthQuota.limit}, month ${monthKey})`
        );
        return NextResponse.json(
          {
            ok: false,
            error: `You've used all ${monthQuota.limit} ${planLabel} AI reports for this month. Upgrade to Pro for more, or wait until next month.`,
            data: {
              code: "monthly_report_limit",
              nextAllowedAt: blocked.nextAllowedAt,
              waitMs: blocked.waitMs,
              cadence: blocked.cadence.label,
              free: {
                used: monthQuota.used,
                limit: monthQuota.limit,
                remaining: monthQuota.remaining,
                monthKey: monthQuota.monthKey,
              },
            },
          },
          { status: 429 }
        );
      }
      monthAfterRun = evaluateFreeReportQuota(usedThisMonth + 1, now, monthLimit);
    } else {
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
    }

    const out = await coalesceReport(user._id, bot, () => generateReportForUser(user, bot, "manual"));
    console.log(`[api/reports] Manual report delivered for user ${user._id} (${bot})`);

    // Monthly caps echo the remaining count. Pro, Ultimate, and legacy weekly echo the next unlock.
    const next = monthAfterRun
      ? monthlyReportQuota(
          monthAfterRun.used,
          Date.now(),
          monthAfterRun.limit,
          reportCadence(user.subscription_plan)
        )
      : checkReportQuota(user.subscription_plan, new Date().toISOString());

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
        nextAllowedAt: next.nextAllowedAt,
        cadenceLabel: next.cadence.label,
        cadenceMs: next.cadence.ms,
        perLabel: next.cadence.perLabel,
        cadenceUnit: next.cadence.unit,
        reportsUsed: monthAfterRun?.used,
        reportsLimit: monthAfterRun?.limit,
        free: isFreeReportPlan(user.subscription_plan) ? monthAfterRun : null,
      },
    });
  } catch (err: any) {
    if (err instanceof EmptyBookReportError || err?.code === "empty-book") {
      console.log(`[api/reports] Empty book — no report and no email for user`, err?.message);
      return NextResponse.json(
        { ok: false, error: err.message, data: { code: "empty-book", emailed: false } },
        { status: 422 }
      );
    }
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

    const monthLimit = monthlyReportLimit(user.subscription_plan);

    const [res, book, monthCount, synthesis] = await Promise.all([
      totalumSdk.crud.query("report", {
        _filter: { user: user._id },
        _sort: { createdAt: "desc" },
        _limit: 50,
      }),
      loadStockRowsForAccount(user._id),
      monthLimit != null ? countFreeReportsThisMonth(user._id, Date.now()) : Promise.resolve(null),
      loadTotalumSynthesis(user._id).catch((err: unknown) => {
        console.error("[api/reports] Live book total unavailable:", err);
        return null;
      }),
    ]);
    const cashNZD =
      synthesis && synthesis.cashBalanceNZD > 0
        ? synthesis.cashBalanceNZD
        : typeof user.cash_balance === "number" && isFinite(user.cash_balance)
          ? Math.max(0, user.cash_balance)
          : 0;
    const bookNZD = synthesis && synthesis.totalValueNZD > 0 ? synthesis.totalValueNZD : cashNZD;
    const rows = (res?.data as any[]) || [];
    // A failed holdings load must not be treated as an empty book — leave the
    // stored wording for the client to reconcile against the dashboard book.
    const liveRows = book.bookLoaded ? book.rows : [];
    const liveFor = (bot: BotKind) => liveBookForAccount(liveRows, user._id, bot);
    const reports = await Promise.all(rows.map(async (r) => {
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
        const relocked = await relockSeededReportPrices(payload);
        payload = reconcileStoredReport(relocked as Record<string, unknown>, liveBook, {
          cashNZD,
          bookNZD,
        });
      }
      const fromPayload =
        payload && typeof payload === "object" && "executiveSummary" in payload
          ? String((payload as { executiveSummary?: string }).executiveSummary || "")
          : "";
      const executiveSummary = reconcileNarrativeWithLiveBook(r.executive_summary || fromPayload, liveBook, reportBot);
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
        emailed: reportPayloadWasEmailed(payload) ? "yes" : "no",
        aiEnhanced: r.ai_enhanced === "yes",
        trigger: r.trigger || "manual",
        generatedAt: r.generated_at || r.createdAt,
        pdfUrl: r.pdf_file?.url ?? null,
      };
    }));

    // Free is 3/month and Starter is 15/month. Pro and Ultimate stay on the rolling window.
    const monthQuota = monthCount && monthLimit != null
      ? (() => {
          const q = evaluateFreeReportQuota(monthCount.count, Date.now(), monthLimit);
          return { used: q.used, limit: q.limit, remaining: q.remaining, monthKey: monthCount.monthKey };
        })()
      : null;

    // Pro/Ultimate: independent per-bot countdowns. Monthly plans share one pool.
    const lastFor = (b: BotKind) => reports.find((r) => r.bot === b)?.generatedAt || null;
    const buildQuota = (b: BotKind) => {
      if (monthQuota) {
        const q = quotaFromMonthly(monthQuota.used, lastFor(b), monthQuota.limit, user.subscription_plan);
        return {
          allowed: q.allowed,
          waitMs: q.waitMs,
          nextAllowedAt: q.nextAllowedAt,
          lastReportAt: q.lastReportAt,
          cadenceLabel: q.cadence.label,
          cadenceUnit: q.cadence.unit,
          cadenceMs: q.cadence.ms,
          perLabel: q.cadence.perLabel,
          reportsUsed: q.reportsUsed,
          reportsLimit: q.reportsLimit,
        };
      }
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
        `Stox allowed=${stockQuota.allowed}, Koins allowed=${cryptoQuota.allowed}` +
        (monthQuota ? `, month ${monthQuota.used}/${monthQuota.limit}` : "") +
        ")"
    );
    return privateJson({
      ok: true,
      userId: user._id,
      data: {
        reports,
        bookLoaded: book.bookLoaded,
        // Per report-system allowance (Stox + Koins tracked independently) — paid/legacy weekly.
        quota: { stock: stockQuota, crypto: cryptoQuota },
        // Pooled monthly allowance for Free. Null on Starter and the rolling plans.
        free: isFreeReportPlan(user.subscription_plan) ? monthQuota : null,
      },
    });
  } catch (err: any) {
    console.error("[api/reports] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Failed to load reports" }, { status: 500 });
  }
}
