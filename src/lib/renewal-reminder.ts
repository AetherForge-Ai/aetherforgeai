/**
 * 7-day reminder before an annual renewal.
 * Sending stays off unless RENEWAL_REMINDER_ENABLED is exactly "on".
 * There is no sent-flag column. Call the cron once each Auckland day.
 * A second call the same day can send the same reminder again.
 */

import { planByKey, planLabel, LEGACY_SUBSCRIPTION_PLANS } from "@/lib/plans";
import { aucklandClock } from "@/lib/product-note";
import { emailIsVerified } from "@/lib/weekly-email";
import { absoluteAuthUrl, escapeHtml } from "@/lib/transactional-mail";
import { ANNUAL_REFUND_RULE, CUSTOMER_EMAIL, ONE_LINE_DISCLAIMER } from "@/lib/public-copy";

export const RENEWAL_REMINDER_DAYS = 7;

export interface RenewalReminderCandidate {
  id: string;
  email: string;
  emailVerified: unknown;
  subscriptionStatus?: string | null;
  subscriptionPlan?: string | null;
  subscriptionExpiresAt?: string | null;
}

export interface RenewalReminderMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function renewalReminderEnabled(env: { RENEWAL_REMINDER_ENABLED?: string }): boolean {
  return env.RENEWAL_REMINDER_ENABLED === "on";
}

export function aucklandDayKey(date: Date): string {
  const clock = aucklandClock(date);
  const month = String(clock.month).padStart(2, "0");
  const day = String(clock.day).padStart(2, "0");
  return `${clock.year}-${month}-${day}`;
}

/** Auckland calendar date, plus a number of calendar days. */
export function aucklandDayPlus(now: Date, days: number): string {
  const clock = aucklandClock(now);
  const shifted = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + days));
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

export function formatAucklandDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const clock = aucklandClock(date);
  const month = MONTHS[clock.month - 1];
  if (!month) return null;
  return `${clock.day} ${month} ${clock.year}`;
}

function annualPlan(plan?: string | null): boolean {
  const key = (plan || "").trim();
  if (!key) return false;
  const found = planByKey(key) ?? LEGACY_SUBSCRIPTION_PLANS.find((item) => item.key === key);
  return found?.interval === "year";
}

export function selectRenewalReminders(
  candidates: readonly RenewalReminderCandidate[],
  now: Date
): RenewalReminderCandidate[] {
  const due = aucklandDayPlus(now, RENEWAL_REMINDER_DAYS);
  return candidates.filter((candidate) => {
    if (!candidate.id || !candidate.email.trim()) return false;
    if (!emailIsVerified(candidate.emailVerified)) return false;
    if (candidate.subscriptionStatus !== "active") return false;
    if (!annualPlan(candidate.subscriptionPlan)) return false;
    const expiry = candidate.subscriptionExpiresAt;
    if (!expiry) return false;
    const expiryDate = new Date(expiry);
    if (Number.isNaN(expiryDate.getTime())) return false;
    return aucklandDayKey(expiryDate) === due;
  });
}

export function renewalReminderMail(input: {
  to: string;
  plan?: string | null;
  expiresAt: string;
}): RenewalReminderMail {
  const renewsOn = formatAucklandDate(input.expiresAt) ?? "the renewal date on your account";
  const planName = planLabel(input.plan);
  const label = planName && planName !== "Free account" ? planName : "annual";
  const refunds = absoluteAuthUrl("/refunds");
  const billing = absoluteAuthUrl("/settings/billing");
  const subject = "Your annual plan renews in 7 days";
  const text = [
    "Hello,",
    "",
    `Your ${label} plan renews on ${renewsOn}. This reminder is sent 7 days before that annual renewal.`,
    "",
    ANNUAL_REFUND_RULE,
    "",
    `Refunds and cancellations: ${refunds}`,
    `Plan and billing: ${billing}`,
    "",
    ONE_LINE_DISCLAIMER,
    "",
    CUSTOMER_EMAIL,
  ].join("\n");
  const html = [
    "<p>Hello,</p>",
    `<p>Your ${escapeHtml(label)} plan renews on ${escapeHtml(renewsOn)}. This reminder is sent 7 days before that annual renewal.</p>`,
    `<p>${escapeHtml(ANNUAL_REFUND_RULE)}</p>`,
    `<p><a href="${escapeHtml(refunds)}">Refunds and cancellations</a></p>`,
    `<p><a href="${escapeHtml(billing)}">Plan and billing</a></p>`,
    `<p>${escapeHtml(ONE_LINE_DISCLAIMER)}</p>`,
    `<p>${escapeHtml(CUSTOMER_EMAIL)}</p>`,
  ].join("");
  return { to: input.to.trim(), subject, html, text };
}

function presentedSecret(url: string, headers: { get(name: string): string | null }): string | null {
  const query = new URL(url).searchParams.get("key") || new URL(url).searchParams.get("secret");
  if (query) return query;
  const header = headers.get("x-cron-secret");
  if (header) return header;
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export async function handleRenewalReminderRequest(args: {
  url: string;
  headers: { get(name: string): string | null };
  env: { CRON_SECRET?: string; RENEWAL_REMINDER_ENABLED?: string };
  now: Date;
  loadCandidates: () => Promise<RenewalReminderCandidate[]>;
  send: (mail: RenewalReminderMail) => Promise<void>;
}): Promise<{ status: number; body: { ok: boolean; sent: number; sender: "on" | "off"; reason: string } }> {
  if (!args.env.CRON_SECRET) {
    return { status: 503, body: { ok: false, sent: 0, sender: "off", reason: "cron-not-configured" } };
  }
  if (presentedSecret(args.url, args.headers) !== args.env.CRON_SECRET) {
    return { status: 401, body: { ok: false, sent: 0, sender: "off", reason: "unauthorized" } };
  }
  if (!renewalReminderEnabled(args.env)) {
    return { status: 200, body: { ok: true, sent: 0, sender: "off", reason: "disabled" } };
  }
  try {
    const due = selectRenewalReminders(await args.loadCandidates(), args.now);
    let sent = 0;
    for (const candidate of due) {
      const expiresAt = candidate.subscriptionExpiresAt;
      if (!expiresAt) continue;
      await args.send(
        renewalReminderMail({
          to: candidate.email,
          plan: candidate.subscriptionPlan,
          expiresAt,
        })
      );
      sent += 1;
    }
    return {
      status: 200,
      body: { ok: true, sent, sender: "on", reason: sent ? "sent" : "none-due" },
    };
  } catch {
    return { status: 500, body: { ok: false, sent: 0, sender: "on", reason: "failed" } };
  }
}
