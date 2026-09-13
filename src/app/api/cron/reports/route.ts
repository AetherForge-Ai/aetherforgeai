import { NextResponse } from "next/server";
import { totalumSdk } from "@/lib/totalum";
import { generateReportForUser } from "@/lib/report-service";
import type { BotKind } from "@/lib/apex";

/**
 * GET|POST /api/cron/reports
 *
 * Scheduled 9am (NZ) briefing job. Meant to be called by the Totalum platform
 * scheduler (or any external cron) once a day at 09:00 Pacific/Auckland. It
 * emails each active subscriber their full SuperGrok 4.3 ULTRA ADVANCED report
 * according to their plan's schedule:
 *
 *   - Apex Weekly              → Mondays only
 *   - Apex Monthly / Yearly    → Monday–Friday
 *   - Apex Dual                → Monday–Friday (both bots)
 *   - Free                     → no scheduled emails (on-demand only)
 *
 * Security: requires the `CRON_SECRET` env var. The caller must present it as
 * `?key=...`, an `x-cron-secret` header, or `Authorization: Bearer ...`.
 * If `CRON_SECRET` is not set the endpoint is disabled (503) — never runs open.
 *
 * Testing: pass `?day=mon|tue|…` to override the weekday, and `?dry=1` to
 * compute eligibility without sending anything.
 */

type DayCode = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
const DAY_ORDER: DayCode[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Current weekday in NZ (Pacific/Auckland), as a 3-letter lowercase code. */
function nzWeekday(): DayCode {
  const label = new Date().toLocaleDateString("en-US", {
    timeZone: "Pacific/Auckland",
    weekday: "short",
  });
  return label.slice(0, 3).toLowerCase() as DayCode;
}

/** Which bots to run for a user, given their bot_access. */
function botsFor(access?: string | null): BotKind[] {
  if (access === "both") return ["stock", "crypto"];
  if (access === "stock" || access === "crypto") return [access];
  return [];
}

/** Whether this plan should receive an email on the given weekday. */
function scheduledOn(plan: string | null | undefined, day: DayCode): boolean {
  const weekdays: DayCode[] = ["mon", "tue", "wed", "thu", "fri"];
  if (plan === "weekly") return day === "mon";
  if (plan === "monthly" || plan === "yearly" || plan === "dual_yearly") return weekdays.includes(day);
  return false; // free / none → no scheduled emails
}

function extractSecret(req: Request): string | null {
  const url = new URL(req.url);
  const q = url.searchParams.get("key") || url.searchParams.get("secret");
  if (q) return q;
  const header = req.headers.get("x-cron-secret");
  if (header) return header;
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

async function handle(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron/reports] CRON_SECRET not configured — job disabled.");
    return NextResponse.json(
      { ok: false, error: "Scheduled reports are not configured (missing CRON_SECRET)." },
      { status: 503 }
    );
  }
  if (extractSecret(req) !== expected) {
    console.warn("[cron/reports] Rejected call with bad/missing secret.");
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dayOverride = url.searchParams.get("day")?.slice(0, 3).toLowerCase() as DayCode | undefined;
  const day: DayCode = dayOverride && DAY_ORDER.includes(dayOverride) ? dayOverride : nzWeekday();
  const dry = url.searchParams.get("dry") === "1";

  console.log(`[cron/reports] Running scheduled briefings for ${day}${dry ? " (dry run)" : ""}`);

  // Pull all active subscribers. Free/none are filtered out by scheduledOn().
  const res = await totalumSdk.crud.query("user", {
    _filter: { subscription_status: "active" },
    _limit: 1000,
  });
  const users = (res?.data as any[]) || [];
  const nowMs = Date.now();

  let considered = 0;
  let sent = 0;
  let skippedEmpty = 0;
  const results: { user: string; bot: BotKind; emailed: boolean }[] = [];

  for (const u of users) {
    const plan = u.subscription_plan as string | null;
    if (!scheduledOn(plan, day)) continue;

    // Respect subscription expiry — no emails after the plan runs out.
    if (u.subscription_expires_at) {
      const exp = new Date(u.subscription_expires_at).getTime();
      if (!Number.isNaN(exp) && exp < nowMs) continue;
    }

    const bots = botsFor(u.bot_access);
    if (!bots.length || !u.email) continue;

    // Which asset classes does this user actually hold? Skip empty ones so we
    // never email a report with no positions.
    let holdings: any[] = [];
    try {
      const hRes = await totalumSdk.crud.query("stock", { _filter: { user: u._id }, _limit: 500 });
      holdings = (hRes?.data as any[]) || [];
    } catch (hErr) {
      console.error(`[cron/reports] Failed to load holdings for ${u._id}:`, hErr);
      continue;
    }
    const hasBot = (bot: BotKind) => holdings.some((h) => (h.asset_type || "stock") === bot);

    for (const bot of bots) {
      if (!hasBot(bot)) {
        skippedEmpty++;
        continue;
      }
      considered++;
      if (dry) {
        results.push({ user: u._id, bot, emailed: false });
        continue;
      }
      try {
        const out = await generateReportForUser(
          {
            _id: u._id,
            name: u.name,
            email: u.email,
            ticker_limit: u.ticker_limit,
            cash_balance: typeof u.cash_balance === "number" ? u.cash_balance : 0,
          },
          bot,
          "scheduled"
        );
        if (out.emailed) sent++;
        results.push({ user: u._id, bot, emailed: out.emailed });
        console.log(`[cron/reports] ${bot} briefing for ${u.email}: emailed=${out.emailed}`);
      } catch (genErr) {
        console.error(`[cron/reports] Report generation failed for ${u._id}/${bot}:`, genErr);
      }
    }
  }

  console.log(
    `[cron/reports] Done — day=${day}, considered=${considered}, sent=${sent}, skippedEmpty=${skippedEmpty}`
  );
  return NextResponse.json({
    ok: true,
    data: { day, dry, considered, sent, skippedEmpty, results },
  });
}

export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (err: any) {
    console.error("[cron/reports] GET error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Cron failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (err: any) {
    console.error("[cron/reports] POST error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Cron failed" }, { status: 500 });
  }
}
